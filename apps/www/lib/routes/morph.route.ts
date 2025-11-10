import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  MORPH_SNAPSHOT_PRESETS,
  type MorphSnapshotId,
} from "@/lib/utils/morph-defaults";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import {
  extractMorphInstanceInfo,
  type MorphInstanceInfo,
} from "@cmux/shared";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { MorphCloudClient } from "morphcloud";
import { getConvex } from "../utils/get-convex";
import { selectGitIdentity } from "../utils/gitIdentity";
import { stackServerAppJs } from "../utils/stack";
import {
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
} from "./sandboxes/git";

export const morphRouter = new OpenAPIHono();

type MorphInstance = Awaited<
  ReturnType<MorphCloudClient["instances"]["get"]>
>;

type ConvexClient = ReturnType<typeof getConvex>;

const FORCE_WAKE_POLL_INTERVAL_MS = 2_000;
const FORCE_WAKE_TIMEOUT_MS = 90_000;

const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isNotFoundError = (error: unknown): boolean =>
  error instanceof Error && error.message.includes("HTTP 404");

function getMorphInstanceInfoFromRun(
  run: Doc<"taskRuns">
): MorphInstanceInfo | null {
  const candidates: Array<string | undefined> = [
    run.vscode?.url,
    run.vscode?.workspaceUrl,
  ];

  if (Array.isArray(run.networking)) {
    for (const service of run.networking) {
      candidates.push(service.url);
    }
  }

  for (const candidate of candidates) {
    if (!candidate) continue;
    const info = extractMorphInstanceInfo(candidate);
    if (info) {
      return info;
    }
  }

  return null;
}

interface WaitForInstanceReadyResult {
  ready: boolean;
  instance: MorphInstance | null;
  polls: number;
  elapsedMs: number;
}

async function waitForInstanceReady(
  client: MorphCloudClient,
  instanceId: string
): Promise<WaitForInstanceReadyResult> {
  const start = Date.now();
  let polls = 0;
  let latest: MorphInstance | null = null;

  while (Date.now() - start < FORCE_WAKE_TIMEOUT_MS) {
    await wait(FORCE_WAKE_POLL_INTERVAL_MS);
    polls += 1;
    latest = await client.instances.get({ instanceId });
    if (latest.status === "ready") {
      return {
        ready: true,
        instance: latest,
        polls,
        elapsedMs: Date.now() - start,
      };
    }
  }

  return {
    ready: false,
    instance: latest,
    polls,
    elapsedMs: Date.now() - start,
  };
}

async function safeUpdateRunVSCodeStatus(
  convex: ConvexClient,
  teamSlugOrId: string,
  runId: Doc<"taskRuns">["_id"],
  status: "starting" | "running"
) {
  try {
    await convex.mutation(api.taskRuns.updateVSCodeStatus, {
      teamSlugOrId,
      id: runId,
      status,
    });
  } catch (error) {
    console.warn(
      `[morph.forceWake] Failed to update VSCode status for run ${runId} -> ${status}`,
      error
    );
  }
}

const morphSnapshotIds = MORPH_SNAPSHOT_PRESETS.map(
  (preset) => preset.id
) as MorphSnapshotId[];

const SnapshotIdSchema = z.enum(
  morphSnapshotIds as [MorphSnapshotId, ...MorphSnapshotId[]]
);

const SetupInstanceBody = z
  .object({
    teamSlugOrId: z.string(),
    instanceId: z.string().optional(), // Existing instance ID to reuse
    selectedRepos: z.array(z.string()).optional(), // Repositories to clone
    ttlSeconds: z.number().default(60 * 30), // 30 minutes default
    // TODO: This is a temporary solution to allow both string and enum values since client values are diff from backend values
    snapshotId: z.union([z.string(), SnapshotIdSchema]).optional(),
  })
  .openapi("SetupInstanceBody");

const SetupInstanceResponse = z
  .object({
    instanceId: z.string(),
    vscodeUrl: z.string(),
    clonedRepos: z.array(z.string()),
    removedRepos: z.array(z.string()),
  })
  .openapi("SetupInstanceResponse");

const ForceWakeVmBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("ForceWakeVmBody");

const ForceWakeVmResponse = z
  .object({
    instanceId: z.string(),
    previousStatus: z.string(),
    currentStatus: z.string(),
    resumed: z.boolean(),
    ready: z.boolean(),
    polls: z.number(),
    readyInMs: z.number().optional(),
  })
  .openapi("ForceWakeVmResponse");

morphRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/morph/task-runs/{taskRunId}/force-wake",
    tags: ["Morph"],
    summary:
      "Resume the Morph VM backing a task run and wait until it reports ready",
    request: {
      params: z.object({
        taskRunId: typedZid("taskRuns"),
      }),
      body: {
        content: {
          "application/json": {
            schema: ForceWakeVmBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: ForceWakeVmResponse,
          },
        },
        description: "VM is awake and ready",
      },
      400: { description: "Invalid payload" },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Task run or instance not found" },
      409: { description: "Task run is not backed by a Morph workspace" },
      500: { description: "Failed to resume or fetch instance state" },
      504: { description: "Instance is still waking up" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.json({ error: "Unauthorized" }, 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const { taskRunId } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    const team = await verifyTeamAccess({ accessToken, teamSlugOrId });
    const convex = getConvex({ accessToken });

    const run = await convex.query(api.taskRuns.get, {
      teamSlugOrId,
      id: taskRunId,
    });

    if (!run) {
      return c.json({ error: "Task run not found" }, 404);
    }
    if (run.teamId !== team.uuid) {
      return c.json(
        { error: "Task run does not belong to this team" },
        403
      );
    }
    if (run.userId !== user.id) {
      return c.json(
        { error: "You do not have permission to control this workspace" },
        403
      );
    }
    if (!run.vscode || run.vscode.provider !== "morph") {
      return c.json(
        { error: "This task run is not backed by a Morph workspace" },
        409
      );
    }

    const morphInfo = getMorphInstanceInfoFromRun(run);
    if (!morphInfo) {
      return c.json(
        {
          error:
            "Unable to resolve the Morph workspace for this task run. Try rerunning the task.",
        },
        409
      );
    }

    const client = new MorphCloudClient({ apiKey: env.MORPH_API_KEY });
    let instance: MorphInstance;
    try {
      instance = await client.instances.get({
        instanceId: morphInfo.instanceId,
      });
    } catch (error) {
      if (isNotFoundError(error)) {
        return c.json(
          { error: "Morph workspace no longer exists for this run" },
          404
        );
      }
      console.error("[morph.forceWake] Failed to fetch instance", error);
      return c.json({ error: "Failed to load Morph workspace" }, 500);
    }

    const metadata = isRecord(instance.metadata) ? instance.metadata : null;
    const instanceUserId =
      typeof metadata?.userId === "string" ? metadata.userId : null;
    if (instanceUserId && instanceUserId !== user.id) {
      return c.json(
        { error: "This Morph workspace belongs to another user" },
        403
      );
    }
    const instanceTeamId =
      typeof metadata?.teamId === "string" ? metadata.teamId : null;
    if (instanceTeamId && instanceTeamId !== run.teamId) {
      return c.json(
        {
          error:
            "This Morph workspace was created for a different team and cannot be resumed here",
        },
        403
      );
    }

    const previousStatus = instance.status;
    if (instance.status === "ready") {
      await safeUpdateRunVSCodeStatus(
        convex,
        teamSlugOrId,
        run._id,
        "running"
      );
      return c.json({
        instanceId: instance.id,
        previousStatus,
        currentStatus: instance.status,
        resumed: false,
        ready: true,
        polls: 0,
        readyInMs: 0,
      });
    }

    await safeUpdateRunVSCodeStatus(
      convex,
      teamSlugOrId,
      run._id,
      "starting"
    );

    try {
      await instance.resume();
    } catch (error) {
      console.error(
        `[morph.forceWake] Failed to resume ${instance.id}`,
        error
      );
      return c.json(
        { error: "Failed to resume Morph workspace" },
        500
      );
    }

    const readiness = await waitForInstanceReady(client, instance.id);
    if (!readiness.ready || !readiness.instance) {
      const status = readiness.instance?.status ?? "unknown";
      console.warn(
        `[morph.forceWake] Instance ${instance.id} still not ready after ${readiness.elapsedMs}ms (last status: ${status})`
      );
      return c.json(
        {
          error:
            "The workspace is waking up but still starting. Give it a few seconds and try again.",
          status,
        },
        504
      );
    }

    await safeUpdateRunVSCodeStatus(
      convex,
      teamSlugOrId,
      run._id,
      "running"
    );

    return c.json({
      instanceId: readiness.instance.id,
      previousStatus,
      currentStatus: readiness.instance.status,
      resumed: true,
      ready: true,
      polls: readiness.polls,
      readyInMs: readiness.elapsedMs,
    });
  }
);

morphRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/morph/setup-instance",
    tags: ["Morph"],
    summary: "Setup a Morph instance with optional repository cloning",
    request: {
      body: {
        content: {
          "application/json": {
            schema: SetupInstanceBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SetupInstanceResponse,
          },
        },
        description: "Instance setup successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to setup instance" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) return c.text("Unauthorized", 401);
    const {
      teamSlugOrId,
      instanceId: existingInstanceId,
      selectedRepos,
      ttlSeconds,
      snapshotId,
    } = c.req.valid("json");

    const convex = getConvex({ accessToken });

    // Verify team access and get the team
    const team = await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });
    const githubAccessTokenPromise = (async () => {
      const githubAccount = await user.getConnectedAccount("github");
      if (!githubAccount) {
        return {
          githubAccessTokenError: "GitHub account not found",
          githubAccessToken: null,
        } as const;
      }
      const { accessToken: githubAccessToken } =
        await githubAccount.getAccessToken();
      if (!githubAccessToken) {
        return {
          githubAccessTokenError: "GitHub access token not found",
          githubAccessToken: null,
        } as const;
      }

      return { githubAccessTokenError: null, githubAccessToken } as const;
    })();
    const gitIdentityPromise = githubAccessTokenPromise.then(
      ({ githubAccessToken }) => {
        if (!githubAccessToken) {
          throw new Error("GitHub access token not found");
        }
        return fetchGitIdentityInputs(convex, githubAccessToken);
      }
    );

    try {
      const client = new MorphCloudClient({
        apiKey: env.MORPH_API_KEY,
      });

      let instance;
      let instanceId = existingInstanceId;
      const selectedSnapshotId = snapshotId ?? DEFAULT_MORPH_SNAPSHOT_ID;

      // If no instanceId provided, create a new instance
      if (!instanceId) {
        console.log(
          `Creating new Morph instance (snapshot: ${selectedSnapshotId})`
        );
        instance = await client.instances.start({
          snapshotId: selectedSnapshotId,
          ttlSeconds,
          ttlAction: "pause",
          metadata: {
            app: "cmux-dev",
            userId: user.id,
            teamId: team.uuid,
          },
        });
        instanceId = instance.id;
        await instance.setWakeOn(true, true);
      } else {
        // Get existing instance
        console.log(`Using existing Morph instance: ${instanceId}`);
        instance = await client.instances.get({ instanceId });

        // Security: ensure the instance belongs to the requested team
        const meta = instance.metadata;
        const instanceTeamId = meta?.teamId;
        if (!instanceTeamId || instanceTeamId !== team.uuid) {
          return c.text(
            "Forbidden: Instance does not belong to this team",
            403
          );
        }
      }

      void gitIdentityPromise
        .then(([who, gh]) => {
          const { name, email } = selectGitIdentity(who, gh);
          return configureGitIdentity(instance, { name, email });
        })
        .catch((error) => {
          console.log(
            `[sandboxes.start] Failed to configure git identity; continuing...`,
            error
          );
        });

      // Get VSCode URL
      const vscodeUrl = instance.networking.httpServices.find(
        (service) => service.port === 39378
      )?.url;

      if (!vscodeUrl) {
        throw new Error("VSCode URL not found");
      }

      const { githubAccessToken, githubAccessTokenError } =
        await githubAccessTokenPromise;
      if (githubAccessTokenError) {
        console.error(
          `[sandboxes.start] GitHub access token error: ${githubAccessTokenError}`
        );
        return c.text("Failed to resolve GitHub credentials", 401);
      }
      await configureGithubAccess(instance, githubAccessToken);

      const url = `${vscodeUrl}/?folder=/root/workspace`;

      // Handle repository management if repos are specified
      const removedRepos: string[] = [];
      const clonedRepos: string[] = [];
      const failedClones: { repo: string; error: string; isAuth: boolean }[] =
        [];

      if (selectedRepos && selectedRepos.length > 0) {
        // Validate repo format and check for duplicates
        const repoNames = new Map<string, string>(); // Map of repo name to full path
        const reposByOwner = new Map<string, string[]>(); // Map of owner -> list of full repo names
        for (const repo of selectedRepos) {
          // Validate format: should be owner/repo
          if (!repo.includes("/") || repo.split("/").length !== 2) {
            return c.text(
              `Invalid repository format: ${repo}. Expected format: owner/repo`,
              400
            );
          }

          const [owner, repoName] = repo.split("/");
          if (!repoName) {
            return c.text(`Invalid repository: ${repo}`, 400);
          }

          // Check for duplicate repo names
          if (repoNames.has(repoName)) {
            return c.text(
              `Duplicate repository name detected: '${repoName}' from both '${repoNames.get(repoName)}' and '${repo}'. ` +
                `Repositories with the same name cannot be cloned to the same workspace.`,
              400
            );
          }
          repoNames.set(repoName, repo);

          // Group by owner for GitHub App installations
          if (!reposByOwner.has(owner)) {
            reposByOwner.set(owner, []);
          }
          reposByOwner.get(owner)!.push(repo);
        }

        // First, get list of existing repos with their remote URLs
        const listReposCmd = await instance.exec(
          "for dir in /root/workspace/*/; do " +
            'if [ -d "$dir/.git" ]; then ' +
            'basename "$dir"; ' +
            "cd \"$dir\" && git remote get-url origin 2>/dev/null || echo 'no-remote'; " +
            "fi; done"
        );

        const lines = listReposCmd.stdout.split("\n").filter(Boolean);
        const existingRepos = new Map<string, string>(); // Map of repo name to remote URL

        for (let i = 0; i < lines.length; i += 2) {
          const repoName = lines[i]?.trim();
          const remoteUrl = lines[i + 1]?.trim();
          if (repoName && remoteUrl && remoteUrl !== "no-remote") {
            existingRepos.set(repoName, remoteUrl);
          } else if (repoName) {
            existingRepos.set(repoName, "");
          }
        }

        // Determine which repos to remove
        for (const [existingName, existingUrl] of existingRepos) {
          const selectedRepo = repoNames.get(existingName);

          if (!selectedRepo) {
            // Repo not in selected list, remove it
            console.log(`Removing repository: ${existingName}`);
            await instance.exec(`rm -rf /root/workspace/${existingName}`);
            removedRepos.push(existingName);
          } else if (existingUrl && !existingUrl.includes(selectedRepo)) {
            // Repo exists but points to different remote, remove and re-clone
            console.log(
              `Repository ${existingName} points to different remote, removing for re-clone`
            );
            await instance.exec(`rm -rf /root/workspace/${existingName}`);
            removedRepos.push(existingName);
            existingRepos.delete(existingName); // Mark for re-cloning
          }
        }

        // For each owner group, mint a token and clone that owner's repos
        for (const [, repos] of reposByOwner) {
          // Clone new repos for this owner in parallel with retries
          const clonePromises = repos.map(async (repo) => {
            const repoName = repo.split("/").pop()!;
            if (!existingRepos.has(repoName)) {
              console.log(`Cloning repository: ${repo}`);

              const maxRetries = 3;
              let lastError: string | undefined;
              let isAuthError = false;

              for (let attempt = 1; attempt <= maxRetries; attempt++) {
                const cloneCmd = await instance.exec(
                  `mkdir -p /root/workspace && cd /root/workspace && git clone https://github.com/${repo}.git ${repoName} 2>&1`
                );

                if (cloneCmd.exit_code === 0) {
                  return { success: true as const, repo };
                } else {
                  lastError = cloneCmd.stderr || cloneCmd.stdout;

                  // Check for authentication errors
                  isAuthError =
                    lastError.includes("Authentication failed") ||
                    lastError.includes("could not read Username") ||
                    lastError.includes("could not read Password") ||
                    lastError.includes("Invalid username or password") ||
                    lastError.includes("Permission denied") ||
                    lastError.includes("Repository not found") ||
                    lastError.includes("403");

                  // Don't retry authentication errors
                  if (isAuthError) {
                    console.error(
                      `Authentication failed for ${repo}: ${lastError}`
                    );
                    break;
                  }

                  if (attempt < maxRetries) {
                    console.log(
                      `Clone attempt ${attempt} failed for ${repo}, retrying...`
                    );
                    // Clean up partial clone if it exists
                    await instance.exec(`rm -rf /root/workspace/${repoName}`);
                    // Wait before retry with exponential backoff
                    await new Promise((resolve) =>
                      setTimeout(resolve, attempt * 1000)
                    );
                  }
                }
              }

              const errorMsg = isAuthError
                ? `Authentication failed - check repository access permissions`
                : `Failed after ${maxRetries} attempts`;

              console.error(
                `Failed to clone ${repo}: ${errorMsg}\nDetails: ${lastError}`
              );
              return {
                success: false as const,
                repo,
                error: lastError || "Unknown error",
                isAuth: isAuthError,
              };
            } else {
              console.log(
                `Repository ${repo} already exists with correct remote, skipping clone`
              );
              return null;
            }
          });

          const results = await Promise.all(clonePromises);

          for (const result of results) {
            if (result && "success" in result) {
              if (result.success) {
                clonedRepos.push(result.repo);
              } else {
                failedClones.push({
                  repo: result.repo,
                  error: result.error,
                  isAuth: result.isAuth,
                });
              }
            }
          }
        }
      }

      console.log(`VSCode Workspace URL: ${url}`);

      return c.json({
        instanceId,
        vscodeUrl: url,
        clonedRepos,
        removedRepos,
        failedClones,
      });
    } catch (error) {
      console.error("Failed to setup Morph instance:", error);
      return c.text("Failed to setup instance", 500);
    }
  }
);
