import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  MORPH_SNAPSHOT_PRESETS,
  type MorphSnapshotId,
} from "@/lib/utils/morph-defaults";
import { DEFAULT_PVE_LXC_SNAPSHOT_ID } from "@/lib/utils/pve-lxc-defaults";
import { getUserFromRequest } from "@/lib/utils/auth";
import { getPveLxcClient } from "@/lib/utils/pve-lxc-client";
import { getActiveSandboxProvider } from "@/lib/utils/sandbox-provider";
import { verifyTeamAccess } from "@/lib/utils/team-verification";
import {
  type SandboxInstance,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@/lib/utils/sandbox-instance";
import { env } from "@/lib/utils/www-env";
import { api } from "@cmux/convex/api";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import * as Sentry from "@sentry/nextjs";
import { HTTPException } from "hono/http-exception";
import { type Instance, MorphCloudClient } from "morphcloud";
import { getConvex } from "../utils/get-convex";
import { selectGitIdentity } from "../utils/gitIdentity";
import {
  configureGithubAccess,
  configureGitIdentity,
  fetchGitIdentityInputs,
} from "./sandboxes/git";

const morphSnapshotIds = MORPH_SNAPSHOT_PRESETS.map(
  (preset) => preset.id,
) as MorphSnapshotId[];

const SnapshotIdSchema = z.enum(
  morphSnapshotIds as [MorphSnapshotId, ...MorphSnapshotId[]],
);

const SetupInstanceBody = z
  .object({
    teamSlugOrId: z.string(),
    instanceId: z.string().optional(),
    selectedRepos: z.array(z.string()).optional(),
    ttlSeconds: z.number().default(60 * 30),
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

export const morphSetupInstanceRouter = new OpenAPIHono();

morphSetupInstanceRouter.openapi(
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
    const user = await Sentry.startSpan(
      { name: "getUserFromRequest", op: "auth" },
      () => getUserFromRequest(c.req.raw),
    );
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await Sentry.startSpan(
      { name: "user.getAuthJson", op: "auth" },
      () => user.getAuthJson(),
    );
    if (!accessToken) return c.text("Unauthorized", 401);
    const {
      teamSlugOrId,
      instanceId: existingInstanceId,
      selectedRepos,
      ttlSeconds,
      snapshotId,
    } = c.req.valid("json");

    const convex = getConvex({ accessToken });

    const verifyTeamPromise = Sentry.startSpan(
      { name: "verifyTeamAccess", op: "auth" },
      () => verifyTeamAccess({ req: c.req.raw, teamSlugOrId }),
    );

    const githubAccessTokenPromise = Sentry.startSpan(
      { name: "getGithubAccessToken", op: "auth" },
      async () => {
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
      },
    );

    const gitIdentityPromise = githubAccessTokenPromise.then(
      ({ githubAccessToken }) => {
        if (!githubAccessToken) {
          throw new Error("GitHub access token not found");
        }
        return Sentry.startSpan(
          { name: "fetchGitIdentityInputs", op: "db" },
          () => fetchGitIdentityInputs(convex, githubAccessToken),
        );
      },
    );

    try {
      const providerConfig = getActiveSandboxProvider();
      const provider = providerConfig.provider;
      const selectedSnapshotId =
        snapshotId ??
        (provider === "pve-lxc"
          ? DEFAULT_PVE_LXC_SNAPSHOT_ID
          : DEFAULT_MORPH_SNAPSHOT_ID);

      let sandboxInstance: SandboxInstance;
      let instanceId = existingInstanceId;
      let vscodeUrl: string | undefined;

      if (provider === "pve-lxc") {
        const team = await verifyTeamPromise;
        const pveClient = getPveLxcClient();

        if (!instanceId) {
          console.log(
            `[morph.setup-instance] Creating new PVE LXC instance (snapshot: ${selectedSnapshotId})`,
          );
          const pveInstance = await pveClient.instances.start({
            snapshotId: selectedSnapshotId,
            ttlSeconds,
            metadata: {
              app: "cmux",
              userId: user.id,
              teamId: team.uuid,
            },
          });
          instanceId = pveInstance.id;
          sandboxInstance = wrapPveLxcInstance(pveInstance);

          void convex
            .mutation(api.sandboxInstances.recordCreate, {
              instanceId,
              provider: "pve-lxc",
              teamSlugOrId,
            })
            .catch((error) =>
              console.error(
                "[morph.setup-instance] Failed to record PVE instance creation (non-fatal):",
                error,
              ),
            );
        } else {
          console.log(
            `[morph.setup-instance] Using existing PVE LXC instance: ${instanceId}`,
          );
          const pveInstance = await pveClient.instances.get({ instanceId });
          sandboxInstance = wrapPveLxcInstance(pveInstance);
        }

        vscodeUrl = sandboxInstance.networking.httpServices.find(
          (service) => service.port === 39378,
        )?.url;
      } else {
        const client = new MorphCloudClient({
          apiKey: env.MORPH_API_KEY,
        });
        let instance: Instance | undefined;

        if (!instanceId) {
          const team = await verifyTeamPromise;

          console.log(
            `Creating new Morph instance (snapshot: ${selectedSnapshotId})`,
          );

          const maxRetries = 3;
          let lastError: Error | undefined;
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              instance = await Sentry.startSpan(
                {
                  name: "client.instances.start",
                  op: "morph",
                  attributes: { attempt },
                },
                () =>
                  client.instances.start({
                    snapshotId: selectedSnapshotId,
                    ttlSeconds,
                    ttlAction: "pause",
                    metadata: {
                      app: "cmux-dev",
                      userId: user.id,
                      teamId: team.uuid,
                    },
                  }),
              );
              break;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              const isConnectTimeout =
                lastError.message.includes("fetch failed") ||
                lastError.message.includes("ConnectTimeoutError") ||
                (lastError.cause instanceof Error &&
                  (lastError.cause.message.includes("Connect Timeout") ||
                    (lastError.cause as NodeJS.ErrnoException).code ===
                      "UND_ERR_CONNECT_TIMEOUT"));

              if (!isConnectTimeout || attempt === maxRetries) {
                throw lastError;
              }

              console.log(
                `[morph.setup-instance] Connection timeout on attempt ${attempt}/${maxRetries}, retrying in ${attempt * 2}s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
            }
          }
          instanceId = instance!.id;
          void Sentry.startSpan(
            { name: "instance.setWakeOn", op: "morph" },
            () => instance!.setWakeOn(true, true),
          );
        } else {
          console.log(`Using existing Morph instance: ${instanceId}`);

          const team = await verifyTeamPromise;

          const maxRetries = 3;
          let lastError: Error | undefined;
          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              instance = await Sentry.startSpan(
                {
                  name: "client.instances.get",
                  op: "morph",
                  attributes: { attempt },
                },
                () => client.instances.get({ instanceId: instanceId! }),
              );
              break;
            } catch (error) {
              lastError = error instanceof Error ? error : new Error(String(error));
              const isConnectTimeout =
                lastError.message.includes("fetch failed") ||
                lastError.message.includes("ConnectTimeoutError") ||
                (lastError.cause instanceof Error &&
                  (lastError.cause.message.includes("Connect Timeout") ||
                    (lastError.cause as NodeJS.ErrnoException).code ===
                      "UND_ERR_CONNECT_TIMEOUT"));

              if (!isConnectTimeout || attempt === maxRetries) {
                throw lastError;
              }

              console.log(
                `[morph.setup-instance] Connection timeout on get attempt ${attempt}/${maxRetries}, retrying in ${attempt * 2}s...`,
              );
              await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
            }
          }

          const meta = instance!.metadata;
          const instanceTeamId = meta?.teamId;
          if (!instanceTeamId || instanceTeamId !== team.uuid) {
            return c.text(
              "Forbidden: Instance does not belong to this team",
              403,
            );
          }
        }

        sandboxInstance = wrapMorphInstance(instance!);
        vscodeUrl = sandboxInstance.networking.httpServices.find(
          (service) => service.port === 39378,
        )?.url;
      }

      if (!vscodeUrl || !instanceId) {
        throw new Error("VSCode URL not found");
      }

      const { githubAccessToken, githubAccessTokenError } =
        await githubAccessTokenPromise;
      if (githubAccessTokenError) {
        console.error(
          `[sandboxes.start] GitHub access token error: ${githubAccessTokenError}`,
        );
        return c.text("Failed to resolve GitHub credentials", 401);
      }

      const wrappedInstance = sandboxInstance;
      const configureGithubPromise = Sentry.startSpan(
        { name: "configureGithubAccess", op: "sandbox.exec" },
        () => configureGithubAccess(wrappedInstance, githubAccessToken),
      );

      void gitIdentityPromise
        .then(([who, gh]) => {
          const { name, email } = selectGitIdentity(who, gh);
          return Sentry.startSpan(
            { name: "configureGitIdentity", op: "sandbox.exec" },
            () => configureGitIdentity(wrappedInstance, { name, email }),
          );
        })
        .catch((error) => {
          console.log(
            `[sandboxes.start] Failed to configure git identity; continuing...`,
            error,
          );
        });

      await configureGithubPromise;

      const url = `${vscodeUrl}/?folder=/root/workspace`;

      const removedRepos: string[] = [];
      const clonedRepos: string[] = [];
      const failedClones: { repo: string; error: string; isAuth: boolean }[] =
        [];

      if (selectedRepos && selectedRepos.length > 0) {
        const isSingleRepo = selectedRepos.length === 1;
        const repoNames = new Map<string, string>();
        const reposByOwner = new Map<string, string[]>();
        for (const repo of selectedRepos) {
          if (!repo.includes("/") || repo.split("/").length !== 2) {
            return c.text(
              `Invalid repository format: ${repo}. Expected format: owner/repo`,
              400,
            );
          }

          const [owner, repoName] = repo.split("/");
          if (!repoName) {
            return c.text(`Invalid repository: ${repo}`, 400);
          }

          if (repoNames.has(repoName)) {
            return c.text(
              `Duplicate repository name detected: '${repoName}' from both '${repoNames.get(repoName)}' and '${repo}'. ` +
                `Repositories with the same name cannot be cloned to the same workspace.`,
              400,
            );
          }
          repoNames.set(repoName, repo);

          if (!reposByOwner.has(owner)) {
            reposByOwner.set(owner, []);
          }
          reposByOwner.get(owner)!.push(repo);
        }

        const rootRepoCheck = await Sentry.startSpan(
          { name: "instance.exec (check root repo)", op: "sandbox.exec" },
          () =>
            sandboxInstance.exec(
              'if [ -d "/root/workspace/.git" ]; then git -C /root/workspace remote get-url origin 2>/dev/null || echo "no-remote"; else echo "no-git"; fi',
            ),
        );
        const rootRepoRemote = rootRepoCheck.stdout.trim();
        const hasRootRepo = rootRepoRemote !== "no-git";
        const clearWorkspaceCmd =
          "rm -rf /root/workspace/.git /root/workspace/* /root/workspace/.[!.]* 2>/dev/null || true";

        if (isSingleRepo) {
          const selectedRepo = selectedRepos[0]!;

          const listReposCmd = await Sentry.startSpan(
            { name: "instance.exec (list repos)", op: "sandbox.exec" },
            () =>
              sandboxInstance.exec(
                "for dir in /root/workspace/*/; do " +
                  'if [ -d "$dir/.git" ]; then ' +
                  'basename "$dir"; ' +
                  "cd \"$dir\" && git remote get-url origin 2>/dev/null || echo 'no-remote'; " +
                  "fi; done",
              ),
          );

          const lines = listReposCmd.stdout.split("\n").filter(Boolean);
          const subdirectoryRepos = new Set<string>();
          for (let i = 0; i < lines.length; i += 2) {
            const repoName = lines[i]?.trim();
            if (repoName) {
              subdirectoryRepos.add(repoName);
            }
          }

          for (const existingName of subdirectoryRepos) {
            console.log(`Removing repository: ${existingName}`);
            await Sentry.startSpan(
              { name: `instance.exec (rm ${existingName})`, op: "sandbox.exec" },
              () => sandboxInstance.exec(`rm -rf /root/workspace/${existingName}`),
            );
            removedRepos.push(existingName);
          }

          const rootRepoMatchesSelected =
            hasRootRepo &&
            rootRepoRemote !== "no-remote" &&
            (rootRepoRemote.endsWith(`/${selectedRepo}.git`) ||
              rootRepoRemote.endsWith(`/${selectedRepo}`));

          if (hasRootRepo && !rootRepoMatchesSelected) {
            console.log(
              "Root workspace repository points to different remote, clearing workspace for re-clone",
            );
            await Sentry.startSpan(
              { name: "instance.exec (clear workspace)", op: "sandbox.exec" },
              () => sandboxInstance.exec(clearWorkspaceCmd),
            );
          }

          if (!rootRepoMatchesSelected) {
            console.log(`Cloning repository to workspace root: ${selectedRepo}`);

            const maxRetries = 3;
            let lastError: string | undefined;
            let isAuthError = false;

            for (let attempt = 1; attempt <= maxRetries; attempt++) {
              const cloneCmd = await Sentry.startSpan(
                {
                  name: "instance.exec (clone root repo)",
                  op: "sandbox.exec",
                  attributes: { attempt },
                },
                () =>
                  sandboxInstance.exec(
                    `mkdir -p /root/workspace && cd /root/workspace && git clone https://github.com/${selectedRepo}.git . 2>&1`,
                  ),
              );

              if (cloneCmd.exit_code === 0) {
                clonedRepos.push(selectedRepo);
                lastError = undefined;
                break;
              }

              lastError = cloneCmd.stderr || cloneCmd.stdout;
              isAuthError =
                lastError.includes("Authentication failed") ||
                lastError.includes("could not read Username") ||
                lastError.includes("could not read Password") ||
                lastError.includes("Invalid username or password") ||
                lastError.includes("Permission denied") ||
                lastError.includes("Repository not found") ||
                lastError.includes("403");

              if (isAuthError) {
                console.error(
                  `Authentication failed for ${selectedRepo}: ${lastError}`,
                );
                break;
              }

              if (attempt < maxRetries) {
                console.log(
                  `Clone attempt ${attempt} failed for ${selectedRepo}, retrying...`,
                );
                await sandboxInstance.exec(clearWorkspaceCmd);
                await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
              }
            }

            if (lastError) {
              const errorMsg = isAuthError
                ? "Authentication failed - check repository access permissions"
                : `Failed after ${maxRetries} attempts`;

              console.error(
                `Failed to clone ${selectedRepo}: ${errorMsg}\nDetails: ${lastError}`,
              );
              failedClones.push({
                repo: selectedRepo,
                error: lastError || "Unknown error",
                isAuth: isAuthError,
              });
            }
          } else {
            console.log(
              `Repository ${selectedRepo} already exists at workspace root with correct remote, skipping clone`,
            );
          }
        } else {
          if (hasRootRepo) {
            console.log(
              "Root workspace has a single-repo layout, clearing workspace for multi-repo clone",
            );
            await Sentry.startSpan(
              { name: "instance.exec (clear workspace)", op: "sandbox.exec" },
              () => sandboxInstance.exec(clearWorkspaceCmd),
            );
          }

          const listReposCmd = await Sentry.startSpan(
            { name: "instance.exec (list repos)", op: "sandbox.exec" },
            () =>
              sandboxInstance.exec(
                "for dir in /root/workspace/*/; do " +
                  'if [ -d "$dir/.git" ]; then ' +
                  'basename "$dir"; ' +
                  "cd \"$dir\" && git remote get-url origin 2>/dev/null || echo 'no-remote'; " +
                  "fi; done",
              ),
          );

          const lines = listReposCmd.stdout.split("\n").filter(Boolean);
          const existingRepos = new Map<string, string>();

          for (let i = 0; i < lines.length; i += 2) {
            const repoName = lines[i]?.trim();
            const remoteUrl = lines[i + 1]?.trim();
            if (repoName && remoteUrl && remoteUrl !== "no-remote") {
              existingRepos.set(repoName, remoteUrl);
            } else if (repoName) {
              existingRepos.set(repoName, "");
            }
          }

          for (const [existingName, existingUrl] of existingRepos) {
            const selectedRepo = repoNames.get(existingName);

            if (!selectedRepo) {
              console.log(`Removing repository: ${existingName}`);
              await Sentry.startSpan(
                { name: `instance.exec (rm ${existingName})`, op: "sandbox.exec" },
                () => sandboxInstance.exec(`rm -rf /root/workspace/${existingName}`),
              );
              removedRepos.push(existingName);
            } else if (
              existingUrl &&
              !(
                existingUrl.endsWith(`/${selectedRepo}.git`) ||
                existingUrl.endsWith(`/${selectedRepo}`)
              )
            ) {
              console.log(
                `Repository ${existingName} points to different remote, removing for re-clone`,
              );
              await Sentry.startSpan(
                { name: `instance.exec (rm ${existingName})`, op: "sandbox.exec" },
                () => sandboxInstance.exec(`rm -rf /root/workspace/${existingName}`),
              );
              removedRepos.push(existingName);
              existingRepos.delete(existingName);
            }
          }

          for (const [, repos] of reposByOwner) {
            const clonePromises = repos.map(async (repo) => {
              const repoName = repo.split("/").pop()!;
              if (!existingRepos.has(repoName)) {
                console.log(`Cloning repository: ${repo}`);

                const maxRetries = 3;
                let lastError: string | undefined;
                let isAuthError = false;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                  const cloneCmd = await Sentry.startSpan(
                    {
                      name: `instance.exec (clone ${repoName})`,
                      op: "sandbox.exec",
                      attributes: { attempt },
                    },
                    () =>
                      sandboxInstance.exec(
                        `mkdir -p /root/workspace && cd /root/workspace && git clone https://github.com/${repo}.git ${repoName} 2>&1`,
                      ),
                  );

                  if (cloneCmd.exit_code === 0) {
                    return { success: true as const, repo };
                  }

                  lastError = cloneCmd.stderr || cloneCmd.stdout;

                  isAuthError =
                    lastError.includes("Authentication failed") ||
                    lastError.includes("could not read Username") ||
                    lastError.includes("could not read Password") ||
                    lastError.includes("Invalid username or password") ||
                    lastError.includes("Permission denied") ||
                    lastError.includes("Repository not found") ||
                    lastError.includes("403");

                  if (isAuthError) {
                    console.error(`Authentication failed for ${repo}: ${lastError}`);
                    break;
                  }

                  if (attempt < maxRetries) {
                    console.log(
                      `Clone attempt ${attempt} failed for ${repo}, retrying...`,
                    );
                    await sandboxInstance.exec(`rm -rf /root/workspace/${repoName}`);
                    await new Promise((resolve) =>
                      setTimeout(resolve, attempt * 1000),
                    );
                  }
                }

                const errorMsg = isAuthError
                  ? "Authentication failed - check repository access permissions"
                  : `Failed after ${maxRetries} attempts`;

                console.error(
                  `Failed to clone ${repo}: ${errorMsg}\nDetails: ${lastError}`,
                );
                return {
                  success: false as const,
                  repo,
                  error: lastError || "Unknown error",
                  isAuth: isAuthError,
                };
              }

              console.log(
                `Repository ${repo} already exists with correct remote, skipping clone`,
              );
              return null;
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
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("Failed to setup instance:", error);
      return c.text("Failed to setup instance", 500);
    }
  },
);
