/**
 * Sandbox Start Routes
 *
 * Endpoints for creating sandbox instances:
 * - POST /sandboxes/start - Start a sandbox environment
 * - POST /sandboxes/prewarm - Prewarm a Morph sandbox for faster startup
 */

import { createRoute, OpenAPIHono } from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import {
  z,
  api,
  env,
  internal,
  AGENT_CONFIGS,
  DEFAULT_MORPH_SNAPSHOT_ID,
  StartSandboxBody,
  StartSandboxResponse,
  allocateScriptIdentifiers,
  applyEnvironmentResult,
  concatConfigBlocks,
  configureGithubAccess,
  configureGitIdentity,
  encodeEnvContentForEnvctl,
  envctlLoadCommand,
  fetchGitIdentityInputs,
  generateGitHubInstallationToken,
  getActiveSandboxProvider,
  getConvex,
  getConvexAdmin,
  getEnvironmentOverridesForAgent,
  getInstanceById,
  getMorphClient,
  getMorphClientOrNull,
  getProviderRegistry,
  getPveLxcClient,
  getSandboxMcpConfigs,
  getSandboxStartErrorMessage,
  getUserFromRequest,
  hydrateWorkspace,
  loadEnvironmentEnvVars,
  mapProviderOverrides,
  parseGithubRepoUrl,
  resolveTeamAndSnapshot,
  runMaintenanceAndDevScripts,
  selectGitIdentity,
  setupProviderAuth,
  stackServerAppJs,
  verifyTeamAccess,
  waitForVSCodeReady,
  waitForWorkerReady,
  wrapMorphInstance,
  wrapPveLxcInstance,
  type ConvexAdminClient,
  type HydrateRepoConfig,
  type Id,
  type PveLxcInstance,
  type SandboxInstance,
} from "./_helpers";

export const sandboxesStartRouter = new OpenAPIHono();

const PrewarmSandboxBody = z
  .object({
    teamSlugOrId: z.string(),
    repoUrl: z.string().optional(),
    branch: z.string().optional(),
  })
  .openapi("PrewarmSandboxBody");

const PrewarmSandboxResponse = z
  .object({
    id: z.string(),
    alreadyExists: z.boolean(),
  })
  .openapi("PrewarmSandboxResponse");

sandboxesStartRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/start",
    tags: ["Sandboxes"],
    summary: "Start a sandbox environment",
    request: {
      body: {
        content: {
          "application/json": {
            schema: StartSandboxBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: StartSandboxResponse,
          },
        },
        description: "Sandbox started successfully",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to start sandbox" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    let accessToken: string | null = null;
    let isJwtAuth = false;
    let jwtPayload: { taskRunId: string; teamId: string; userId: string } | null =
      null;

    if (user) {
      const authJson = await user.getAuthJson();
      accessToken = authJson.accessToken || null;
    }

    if (!accessToken) {
      const { extractTaskRunJwtFromRequest, verifyTaskRunJwt } = await import(
        "@/lib/utils/jwt-task-run"
      );
      const jwtToken = extractTaskRunJwtFromRequest(c.req.raw);
      if (jwtToken) {
        const payload = await verifyTaskRunJwt(jwtToken);
        if (payload) {
          isJwtAuth = true;
          jwtPayload = payload;
          console.log("[sandboxes.start] Using JWT auth", {
            taskRunId: payload.taskRunId,
            teamId: payload.teamId,
          });
        }
      }
    }

    if (!accessToken && !isJwtAuth) {
      return c.text("Unauthorized", 401);
    }

    const githubAccessTokenPromise = (async () => {
      if (user) {
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
      }

      return {
        githubAccessTokenError: "JWT auth - GitHub token not available",
        githubAccessToken: null,
      } as const;
    })();

    const body = c.req.valid("json");
    try {
      console.log("[sandboxes.start] incoming", {
        teamSlugOrId: body.teamSlugOrId,
        hasEnvId: Boolean(body.environmentId),
        hasSnapshotId: Boolean(body.snapshotId),
        repoUrl: body.repoUrl,
        branch: body.branch,
        authMethod: isJwtAuth ? "jwt" : "stack-auth",
      });
    } catch {
      // noop
    }

    try {
      let rawAdminClient: ConvexAdminClient | null = null;
      const convex = isJwtAuth
        ? (() => {
            const admin = getConvexAdmin();
            if (!admin) {
              throw new Error("Admin client not available for JWT auth");
            }
            rawAdminClient = admin;
            return admin as unknown as ReturnType<typeof getConvex>;
          })()
        : getConvex({ accessToken: accessToken! });

      let preVerifiedTeam:
        | {
            uuid: string;
            slug: string | null;
            displayName: string | null;
            name: string | null;
          }
        | undefined;
      if (isJwtAuth && jwtPayload && rawAdminClient) {
        const teamInfo = (await rawAdminClient.query(
          internal.teams.getBySlugOrIdInternal,
          {
            slugOrId: body.teamSlugOrId,
          },
        )) as {
          teamId: string;
          slug: string | null;
          displayName: string | null;
          name: string | null;
          profileImageUrl: string | null;
        } | null;
        if (!teamInfo) {
          console.error("[sandboxes.start] Team not found for JWT auth", {
            teamSlugOrId: body.teamSlugOrId,
            jwtTeamId: jwtPayload.teamId,
          });
          return c.text("Team not found", 404);
        }
        if (teamInfo.teamId !== jwtPayload.teamId) {
          console.error("[sandboxes.start] Team mismatch with JWT", {
            requestTeamId: teamInfo.teamId,
            jwtTeamId: jwtPayload.teamId,
          });
          return c.text("Forbidden: Team mismatch", 403);
        }
        preVerifiedTeam = {
          uuid: teamInfo.teamId,
          slug: teamInfo.slug,
          displayName: teamInfo.displayName,
          name: teamInfo.name,
        };
        console.log("[sandboxes.start] JWT auth team verified", {
          teamId: preVerifiedTeam.uuid,
          slug: preVerifiedTeam.slug,
        });
      }

      const {
        team,
        provider,
        resolvedSnapshotId,
        resolvedTemplateVmid,
        environmentDataVaultKey,
        environmentMaintenanceScript,
        environmentDevScript,
        environmentSelectedRepos,
      } = await resolveTeamAndSnapshot({
        req: c.req.raw,
        convex,
        teamSlugOrId: body.teamSlugOrId,
        environmentId: body.environmentId,
        snapshotId: body.snapshotId,
        preVerifiedTeam,
      });

      const environmentEnvVarsPromise = environmentDataVaultKey
        ? loadEnvironmentEnvVars(environmentDataVaultKey)
        : Promise.resolve<string | null>(null);

      const repoUrl = body.repoUrl ?? environmentSelectedRepos?.[0] ?? null;
      if (!body.repoUrl && environmentSelectedRepos?.[0]) {
        console.log(`[sandboxes.start] Using environment selectedRepo: ${repoUrl}`);
      }
      const parsedRepoUrl = repoUrl ? parseGithubRepoUrl(repoUrl) : null;

      const workspaceConfigRepoInputs = body.environmentId
        ? environmentSelectedRepos ?? []
        : parsedRepoUrl
          ? [parsedRepoUrl.fullName]
          : [];
      const workspaceConfigRepos = Array.from(
        new Set(
          workspaceConfigRepoInputs.flatMap((repoInput) => {
            const parsedRepo = parseGithubRepoUrl(repoInput);
            if (!parsedRepo) {
              console.warn(
                `[sandboxes.start] Skipping invalid workspace config repo "${repoInput}"`,
              );
              return [];
            }
            return [parsedRepo.fullName];
          }),
        ),
      );

      const workspaceConfigs = await Promise.all(
        workspaceConfigRepos.map(async (projectFullName) => {
          try {
            const config = await convex.query(api.workspaceConfigs.get, {
              teamSlugOrId: body.teamSlugOrId,
              projectFullName,
            });
            if (!config) {
              return null;
            }
            const envVarsContent = config.dataVaultKey
              ? await loadEnvironmentEnvVars(config.dataVaultKey)
              : null;
            console.log(
              `[sandboxes.start] Loaded workspace config for ${projectFullName}`,
              {
                hasMaintenanceScript: Boolean(config.maintenanceScript),
                hasEnvVars: Boolean(envVarsContent),
              },
            );
            return {
              projectFullName,
              maintenanceScript: config.maintenanceScript ?? undefined,
              envVarsContent: envVarsContent ?? undefined,
            };
          } catch (error) {
            console.error(
              `[sandboxes.start] Failed to load workspace config for ${projectFullName}`,
              error,
            );
            return null;
          }
        }),
      );
      const loadedWorkspaceConfigs = workspaceConfigs.flatMap((config) =>
        config ? [config] : [],
      );
      const workspaceMaintenanceScript = concatConfigBlocks(
        loadedWorkspaceConfigs.map((config) => config.maintenanceScript),
        "\n\n",
      );
      const workspaceEnvVarsContent = concatConfigBlocks(
        loadedWorkspaceConfigs.map((config) => config.envVarsContent),
        "\n",
      );

      const maintenanceScript = concatConfigBlocks(
        [workspaceMaintenanceScript, environmentMaintenanceScript],
        "\n\n",
      );
      const devScript = environmentDevScript ?? null;

      const isCloudWorkspace =
        body.isCloudWorkspace !== undefined
          ? body.isCloudWorkspace
          : !body.taskRunId;

      const scriptIdentifiers =
        maintenanceScript || devScript ? allocateScriptIdentifiers() : null;

      const gitIdentityPromise = githubAccessTokenPromise.then(
        ({ githubAccessToken }) => {
          if (!githubAccessToken) {
            throw new Error("GitHub access token not found");
          }
          return fetchGitIdentityInputs(convex, githubAccessToken);
        },
      );

      let instance: SandboxInstance | null = null;
      let rawPveLxcInstance: PveLxcInstance | null = null;
      let usedWarmPool = false;
      let warmPoolRepoUrl: string | undefined;
      let warmPoolBranch: string | undefined;

      if (provider === "pve-lxc") {
        console.log(
          `[sandboxes.start] Starting PVE LXC sandbox with snapshot ${resolvedSnapshotId}`,
        );
        const pveClient = getPveLxcClient();
        rawPveLxcInstance = await pveClient.instances.start({
          snapshotId: resolvedSnapshotId,
          templateVmid: resolvedTemplateVmid,
          ttlSeconds: body.ttlSeconds ?? 60 * 60,
          ttlAction: "pause",
          metadata: {
            app: "cmux",
            teamId: team.uuid,
            userId: user?.id ?? jwtPayload?.userId ?? "unknown",
            ...(body.environmentId ? { environmentId: body.environmentId } : {}),
            ...(body.metadata || {}),
          },
        });
        instance = wrapPveLxcInstance(rawPveLxcInstance);
        console.log(`[sandboxes.start] PVE LXC sandbox started: ${instance.id}`);
      } else {
        const client = getMorphClient();

        if (!body.environmentId) {
          try {
            const claimed = await convex.mutation(api.warmPool.claimInstance, {
              teamId: team.uuid,
              repoUrl: repoUrl ?? undefined,
              branch: body.branch ?? undefined,
              taskRunId: body.taskRunId || "",
            });

            if (claimed) {
              console.log(
                `[sandboxes.start] Claimed warm pool instance ${claimed.instanceId}`,
              );
              let claimedMorphInstance = await client.instances.get({
                instanceId: claimed.instanceId,
              });
              if (claimedMorphInstance.networking.httpServices.length === 0) {
                claimedMorphInstance = await client.instances.get({
                  instanceId: claimed.instanceId,
                });
              }

              const claimedWrapped = wrapMorphInstance(claimedMorphInstance);
              const claimedExposed = claimedWrapped.networking.httpServices;
              const claimedVscodeService = claimedExposed.find(
                (service) => service.port === 39378,
              );
              const claimedWorkerService = claimedExposed.find(
                (service) => service.port === 39377,
              );
              if (claimedVscodeService && claimedWorkerService) {
                instance = claimedWrapped;
                usedWarmPool = true;
                warmPoolRepoUrl = claimed.repoUrl;
                warmPoolBranch = claimed.branch;
                void (async () => {
                  await instance.setWakeOn(true, true);
                })();
              } else {
                console.warn(
                  `[sandboxes.start] Warm pool instance ${claimed.instanceId} missing services, falling back to on-demand start`,
                );
              }
            }
          } catch (error) {
            console.error(
              "[sandboxes.start] Warm pool claim failed, falling back to on-demand start",
              error,
            );
          }
        }

        if (!usedWarmPool) {
          const morphInstance = await client.instances.start({
            snapshotId: resolvedSnapshotId,
            ttlSeconds: body.ttlSeconds ?? 60 * 60,
            ttlAction: "pause",
            metadata: {
              app: "cmux",
              teamId: team.uuid,
              ...(body.environmentId ? { environmentId: body.environmentId } : {}),
              ...(body.metadata || {}),
            },
          });
          instance = wrapMorphInstance(morphInstance);
          void (async () => {
            await instance.setWakeOn(true, true);
          })();
        }
      }

      if (!instance) {
        return c.text("Failed to start sandbox instance", 500);
      }

      try {
        await convex.mutation(api.sandboxInstances.recordCreate, {
          instanceId: instance.id,
          provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
          vmid: rawPveLxcInstance?.vmid,
          hostname: rawPveLxcInstance?.networking.hostname,
          snapshotId: resolvedSnapshotId,
          snapshotProvider: provider === "pve-lxc" ? "pve-lxc" : "morph",
          templateVmid: resolvedTemplateVmid,
          teamSlugOrId: body.teamSlugOrId,
          isCloudWorkspace,
        });
        console.log(
          `[sandboxes.start] Recorded instance creation for ${instance.id}`,
        );
      } catch (error) {
        console.error(
          "[sandboxes.start] Failed to record instance creation (non-fatal):",
          error,
        );
      }

      let refreshedInstance: SandboxInstance = instance;
      if (instance.networking.httpServices.length === 0) {
        refreshedInstance = await getInstanceById(instance.id, getMorphClientOrNull());
      }

      const exposed = refreshedInstance.networking.httpServices;
      const vscodeService = exposed.find((service) => service.port === 39378);
      const workerPort = provider === "pve-lxc" ? 39376 : 39377;
      const workerService = exposed.find((service) => service.port === workerPort);
      const vncService = exposed.find((service) => service.port === 39380);
      const xtermService = exposed.find((service) => service.port === 39383);
      if (!vscodeService || !workerService) {
        await instance.stop().catch((stopError) => {
          console.error(
            `[sandboxes.start] Failed to stop instance ${instance.id}:`,
            stopError,
          );
        });
        return c.text("VSCode or worker service not found", 500);
      }

      const vscodeReady = await waitForVSCodeReady(vscodeService.url);
      if (!vscodeReady) {
        console.warn(
          `[sandboxes.start] VSCode server did not become ready within timeout for ${instance.id}, proceeding anyway`,
        );
      } else {
        console.log(`[sandboxes.start] VSCode server ready for ${instance.id}`);
      }

      const workerReady = await waitForWorkerReady(workerService.url);
      if (!workerReady) {
        console.warn(
          `[sandboxes.start] Worker server did not become ready within timeout for ${instance.id}, proceeding anyway`,
        );
      } else {
        console.log(`[sandboxes.start] Worker server ready for ${instance.id}`);
      }

      let vscodePersisted = false;
      if (body.taskRunId) {
        try {
          await convex.mutation(api.taskRuns.updateVSCodeInstance, {
            teamSlugOrId: body.teamSlugOrId,
            id: body.taskRunId as Id<"taskRuns">,
            vscode: {
              provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
              containerName: instance.id,
              status: "starting",
              url: vscodeService.url,
              workspaceUrl: `${vscodeService.url}/?folder=/root/workspace`,
              vncUrl: vncService?.url,
              xtermUrl: xtermService?.url,
              startedAt: Date.now(),
            },
          });
          vscodePersisted = true;
          console.log(
            `[sandboxes.start] Persisted VSCode info for ${body.taskRunId}`,
          );
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to persist VSCode info (non-fatal):",
            error,
          );
        }

        if (environmentSelectedRepos && environmentSelectedRepos.length > 0) {
          try {
            await convex.mutation(api.taskRuns.updateDiscoveredRepos, {
              teamSlugOrId: body.teamSlugOrId,
              runId: body.taskRunId as Id<"taskRuns">,
              discoveredRepos: environmentSelectedRepos,
            });
            console.log(
              `[sandboxes.start] Stored discovered repos for ${body.taskRunId}:`,
              environmentSelectedRepos,
            );
          } catch (error) {
            console.error(
              "[sandboxes.start] Failed to store discovered repos (non-fatal):",
              error,
            );
          }
        }
      }

      const environmentEnvVarsContent = await environmentEnvVarsPromise;

      let envVarsToApply =
        concatConfigBlocks(
          [workspaceEnvVarsContent, environmentEnvVarsContent],
          "\n",
        ) ?? "";

      if (body.taskRunId) {
        envVarsToApply += `\nCMUX_TASK_RUN_ID="${body.taskRunId}"`;
      }
      if (body.taskRunJwt) {
        envVarsToApply += `\nCMUX_TASK_RUN_JWT="${body.taskRunJwt}"`;
        if (env.CMUX_TASK_RUN_JWT_SECRET) {
          envVarsToApply += `\nCMUX_TASK_RUN_JWT_SECRET="${env.CMUX_TASK_RUN_JWT_SECRET}"`;
        } else {
          console.warn(
            "[sandboxes.start] CMUX_TASK_RUN_JWT_SECRET not configured, image uploads will not work",
          );
        }
      }

      if (envVarsToApply.trim().length > 0) {
        try {
          const encodedEnv = encodeEnvContentForEnvctl(envVarsToApply);
          const loadRes = await instance.exec(envctlLoadCommand(encodedEnv));
          if (loadRes.exit_code === 0) {
            console.log(`[sandboxes.start] Applied environment variables via envctl`, {
              hasEnvironmentVars: Boolean(environmentEnvVarsContent),
              hasWorkspaceVars: Boolean(workspaceEnvVarsContent),
              hasTaskRunId: Boolean(body.taskRunId),
              hasTaskRunJwt: Boolean(body.taskRunJwt),
            });
          } else {
            console.error(
              `[sandboxes.start] Env var bootstrap failed exit=${loadRes.exit_code} stderr=${(loadRes.stderr || "").slice(0, 200)}`,
            );
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to apply environment variables",
            error,
          );
        }
      }

      const userApiKeysPromise = convex
        .query(api.apiKeys.getAllForAgents, {
          teamSlugOrId: body.teamSlugOrId,
        })
        .catch((err: unknown) => {
          console.error(
            "[sandboxes.start] Failed to fetch API keys (non-fatal):",
            err,
          );
          return {} as Record<string, string>;
        });

      const providerAuthPromise = (async () => {
        try {
          const callbackUrl = env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:9779";
          const [previousKnowledge, previousMailbox] = await Promise.all([
            convex
              .query(api.agentMemoryQueries.getLatestTeamKnowledge, {
                teamSlugOrId: body.teamSlugOrId,
              })
              .catch((err: unknown) => {
                console.error(
                  "[sandboxes.start] Failed to fetch previous team knowledge (non-fatal):",
                  err,
                );
                return null;
              }),
            convex
              .query(api.agentMemoryQueries.getLatestTeamMailbox, {
                teamSlugOrId: body.teamSlugOrId,
              })
              .catch((err: unknown) => {
                console.error(
                  "[sandboxes.start] Failed to fetch previous team mailbox (non-fatal):",
                  err,
                );
                return null;
              }),
          ]);
          const result = await setupProviderAuth(instance, convex, {
            teamSlugOrId: body.teamSlugOrId,
            projectFullName: parsedRepoUrl?.fullName,
            taskRunId: body.taskRunId || undefined,
            taskRunJwt: body.taskRunJwt || undefined,
            callbackUrl,
            previousKnowledge,
            previousMailbox,
            agentName: body.agentName,
          });
          if (result.providers.length > 0) {
            console.log(
              `[sandboxes.start] Provider auth configured: ${result.providers.join(", ")}`,
            );
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Provider auth setup failed (non-fatal):",
            error,
          );
        }
      })();

      const configureGitIdentityTask = gitIdentityPromise
        .then(([who, gh]) => {
          const { name, email } = selectGitIdentity(who, gh);
          return configureGitIdentity(instance, { name, email });
        })
        .catch((error) => {
          console.log(
            `[sandboxes.start] Failed to configure git identity; continuing...`,
            error,
          );
        });

      const { githubAccessToken, githubAccessTokenError } =
        await githubAccessTokenPromise;
      const needsGitHubToken = parsedRepoUrl != null;
      if (githubAccessTokenError && needsGitHubToken) {
        console.error(
          `[sandboxes.start] GitHub access token error: ${githubAccessTokenError}`,
        );
        return c.text("Failed to resolve GitHub credentials", 401);
      }
      if (githubAccessTokenError) {
        console.log(
          `[sandboxes.start] GitHub access token not available (${githubAccessTokenError}), but no repo URL specified - continuing`,
        );
      }

      let gitAuthToken = githubAccessToken;
      if (parsedRepoUrl) {
        try {
          const connections = await convex.query(api.github.listProviderConnections, {
            teamSlugOrId: body.teamSlugOrId,
          });
          const targetConnection = connections.find(
            (co: { isActive?: boolean; accountLogin?: string | null }) =>
              co.isActive &&
              co.accountLogin?.toLowerCase() === parsedRepoUrl.owner.toLowerCase(),
          );
          if (targetConnection) {
            console.log(
              `[sandboxes.start] Found GitHub App installation ${targetConnection.installationId} for ${parsedRepoUrl.owner}`,
            );
            const appToken = await generateGitHubInstallationToken({
              installationId: targetConnection.installationId,
              repositories: [parsedRepoUrl.fullName],
              permissions: {
                contents: "write",
                metadata: "read",
                workflows: "write",
                pull_requests: "write",
              },
            });
            gitAuthToken = appToken;
            console.log(
              `[sandboxes.start] Using GitHub App token for git authentication`,
            );
          } else {
            console.log(
              `[sandboxes.start] No GitHub App installation found for ${parsedRepoUrl.owner}, using user OAuth token`,
            );
          }
        } catch (error) {
          console.error(
            `[sandboxes.start] Failed to get GitHub App token, falling back to user OAuth:`,
            error,
          );
        }
      }

      if (gitAuthToken) {
        await configureGithubAccess(instance, gitAuthToken);
      } else {
        console.log(
          `[sandboxes.start] Skipping GitHub access configuration - no token available`,
        );
      }

      const requestedBranch = body.branch ?? undefined;
      const skipHydration =
        usedWarmPool &&
        typeof repoUrl === "string" &&
        repoUrl.length > 0 &&
        warmPoolRepoUrl === repoUrl &&
        warmPoolBranch === requestedBranch;
      if (skipHydration) {
        console.log(
          `[sandboxes.start] Skipping hydration - repo and branch already cloned in warm pool instance ${instance.id}`,
        );
      } else {
        let repoConfig: HydrateRepoConfig | undefined;
        if (repoUrl) {
          console.log(`[sandboxes.start] Hydrating repo for ${instance.id}`);
          if (!parsedRepoUrl) {
            return c.text("Unsupported repo URL; expected GitHub URL", 400);
          }
          console.log(`[sandboxes.start] Parsed owner/repo: ${parsedRepoUrl.fullName}`);

          const authenticatedGitUrl = gitAuthToken
            ? `https://x-access-token:${gitAuthToken}@github.com/${parsedRepoUrl.owner}/${parsedRepoUrl.repo}.git`
            : parsedRepoUrl.gitUrl;
          const maskedGitUrl = gitAuthToken
            ? `https://x-access-token:***@github.com/${parsedRepoUrl.owner}/${parsedRepoUrl.repo}.git`
            : parsedRepoUrl.gitUrl;

          repoConfig = {
            owner: parsedRepoUrl.owner,
            name: parsedRepoUrl.repo,
            repoFull: parsedRepoUrl.fullName,
            cloneUrl: authenticatedGitUrl,
            maskedCloneUrl: maskedGitUrl,
            depth: Math.max(1, Math.floor(body.depth ?? 1)),
            baseBranch: body.branch || "main",
            newBranch: body.newBranch ?? "",
          };
        }

        try {
          await hydrateWorkspace({
            instance,
            repo: repoConfig,
          });
        } catch (error) {
          console.error(`[sandboxes.start] Hydration failed:`, error);
          await instance.stop().catch((stopError) => {
            console.error(
              `[sandboxes.start] Failed to stop instance ${instance.id} after hydration failure:`,
              stopError,
            );
          });
          return c.text("Failed to hydrate sandbox", 500);
        }
      }

      if (body.taskRunId) {
        console.log(
          "[sandboxes.start] Capturing starting commit SHA for taskRunId:",
          body.taskRunId,
        );
        try {
          const execResult = await instance.exec("git -C /root/workspace rev-parse HEAD");
          console.log("[sandboxes.start] git rev-parse HEAD result:", {
            exit_code: execResult.exit_code,
            stdout: execResult.stdout?.substring(0, 50),
          });
          if (execResult.exit_code === 0 && execResult.stdout) {
            const startingCommitSha = execResult.stdout.trim();
            console.log(
              "[sandboxes.start] Starting commit SHA:",
              startingCommitSha,
              "length:",
              startingCommitSha.length,
            );
            if (startingCommitSha.length === 40) {
              console.log(
                "[sandboxes.start] Saving startingCommitSha to Convex:",
                startingCommitSha,
              );
              void convex
                .mutation(api.taskRuns.updateStartingCommitSha, {
                  teamSlugOrId: body.teamSlugOrId,
                  id: body.taskRunId as Id<"taskRuns">,
                  startingCommitSha,
                })
                .catch((error) => {
                  console.error(
                    "[sandboxes.start] Failed to update starting commit SHA:",
                    error,
                  );
                });
            }
          }
        } catch (error) {
          console.error(
            "[sandboxes.start] Failed to capture starting commit SHA:",
            error,
          );
        }
      }

      if (body.taskRunId && vscodePersisted) {
        void convex
          .mutation(api.taskRuns.updateVSCodeStatus, {
            teamSlugOrId: body.teamSlugOrId,
            id: body.taskRunId as Id<"taskRuns">,
            status: "running",
          })
          .catch((error) => {
            console.error(
              "[sandboxes.start] Failed to update VSCode status to running:",
              error,
            );
          });
      }

      if (body.taskRunId && parsedRepoUrl) {
        void (async () => {
          try {
            const taskRun = await convex.query(api.taskRuns.get, {
              teamSlugOrId: body.teamSlugOrId,
              id: body.taskRunId as Id<"taskRuns">,
            });
            if (taskRun) {
              await convex.mutation(api.tasks.setProjectAndBranch, {
                teamSlugOrId: body.teamSlugOrId,
                id: taskRun.taskId,
                projectFullName: parsedRepoUrl.fullName,
                baseBranch: body.branch ?? "main",
              });
            }
          } catch (error) {
            console.error(
              "[sandboxes.start] Failed to set project and branch info:",
              error,
            );
          }
        })();
      }

      if (maintenanceScript || devScript) {
        (async () => {
          await runMaintenanceAndDevScripts({
            instance,
            maintenanceScript: maintenanceScript || undefined,
            devScript: devScript || undefined,
            identifiers: scriptIdentifiers ?? undefined,
            convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
            taskRunJwt: body.taskRunJwt || undefined,
            isCloudWorkspace,
          });
        })().catch((error) => {
          console.error(
            "[sandboxes.start] Background script execution failed:",
            error,
          );
        });
      }

      await configureGitIdentityTask;

      if (body.agentName && body.prompt) {
        await providerAuthPromise;

        const agentConfig = AGENT_CONFIGS.find((a) => a.name === body.agentName);
        if (agentConfig) {
          console.log(
            `[sandboxes.start] Starting agent ${body.agentName} with prompt`,
          );

          if (agentConfig.environment) {
            try {
              const callbackUrl = env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:9779";
              const [resolvedApiKeys, previousKnowledge, previousMailbox] =
                await Promise.all([
                  userApiKeysPromise,
                  convex
                    .query(api.agentMemoryQueries.getLatestTeamKnowledge, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch previous team knowledge for agent environment (non-fatal):",
                        err,
                      );
                      return null;
                    }),
                  convex
                    .query(api.agentMemoryQueries.getLatestTeamMailbox, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch previous team mailbox for agent environment (non-fatal):",
                        err,
                      );
                      return null;
                    }),
                ]);
              const [workspaceSettings, providerOverrides, mcpConfigs] =
                await Promise.all([
                  convex
                    .query(api.workspaceSettings.get, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch workspace settings for agent environment (non-fatal):",
                        err,
                      );
                      return null;
                    }),
                  convex
                    .query(api.providerOverrides.getForTeam, {
                      teamSlugOrId: body.teamSlugOrId,
                    })
                    .catch((err: unknown) => {
                      console.error(
                        "[sandboxes.start] Failed to fetch provider overrides for agent environment (non-fatal):",
                        err,
                      );
                      return [];
                    }),
                  getSandboxMcpConfigs(convex, {
                    teamSlugOrId: body.teamSlugOrId,
                    projectFullName: parsedRepoUrl?.fullName,
                    logPrefix: "sandboxes.start",
                  }),
                ]);
              const registry = getProviderRegistry();
              const overrideMapped = mapProviderOverrides(providerOverrides);
              const resolvedProvider = registry.resolveForAgent(
                body.agentName,
                overrideMapped,
              );
              const envOverrides = getEnvironmentOverridesForAgent(
                body.agentName,
                {
                  mcpConfigs,
                  workspaceSettings,
                  taskRunJwt: body.taskRunJwt,
                  resolvedProvider,
                  openAiBaseUrl: resolvedApiKeys.OPENAI_BASE_URL,
                },
              );
              console.log("[sandboxes.start] Agent environment overrides", {
                agentName: body.agentName,
                mcpServerConfigCount: envOverrides.mcpServerConfigs?.length ?? 0,
                hasWorkspaceSettings: !!envOverrides.workspaceSettings,
                hasProviderConfig: !!envOverrides.providerConfig,
              });
              const envResult = await agentConfig.environment({
                taskRunId: body.taskRunId || "",
                taskRunJwt: body.taskRunJwt || "",
                agentName: body.agentName,
                prompt: body.prompt,
                apiKeys: resolvedApiKeys,
                callbackUrl,
                previousKnowledge: previousKnowledge ?? undefined,
                previousMailbox: previousMailbox ?? undefined,
                ...envOverrides,
              });

              await applyEnvironmentResult(
                instance,
                envResult,
                "sandboxes.start:agent-env",
              );
            } catch (envError) {
              console.error(
                `[sandboxes.start] Failed to set up agent environment:`,
                envError,
              );
            }
          }

          const agentCmd = [agentConfig.command, ...agentConfig.args].join(" ");
          const terminalId = `agent-${body.taskRunId || "cli"}`;

          try {
            const createTerminalResponse = await fetch(
              `${workerService.url}/api/create-terminal`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  terminalId,
                  taskRunId: body.taskRunId,
                  taskRunJwt: body.taskRunJwt,
                  agentName: agentConfig.name,
                  prompt: body.prompt,
                  ptyCommand: agentCmd,
                  cwd: "/root/workspace",
                  env: {},
                  startupCommands: [],
                  postStartCommands: [],
                  convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
                }),
                signal: AbortSignal.timeout(30000),
              },
            );

            if (createTerminalResponse.ok) {
              const result = await createTerminalResponse.json();
              console.log(
                `[sandboxes.start] Started agent terminal via worker API: ${terminalId}`,
                result,
              );
            } else {
              const errorText = await createTerminalResponse.text();
              console.error(
                `[sandboxes.start] Failed to create agent terminal: ${createTerminalResponse.status} ${errorText}`,
              );
              const fallbackCmd = `tmux new-session -d -s '${terminalId}' -c /root/workspace 'source /etc/profile 2>/dev/null || true; ${agentCmd}'`;
              await instance.exec(fallbackCmd);
              console.log(
                `[sandboxes.start] Fell back to tmux for agent: ${terminalId}`,
              );
            }
          } catch (startError) {
            console.error(
              `[sandboxes.start] Failed to start agent via worker API:`,
              startError,
            );
            try {
              const fallbackCmd = `tmux new-session -d -s '${terminalId}' -c /root/workspace 'source /etc/profile 2>/dev/null || true; ${agentCmd}'`;
              await instance.exec(fallbackCmd);
              console.log(
                `[sandboxes.start] Fell back to tmux for agent: ${terminalId}`,
              );
            } catch (fallbackError) {
              console.error(
                `[sandboxes.start] Tmux fallback also failed:`,
                fallbackError,
              );
            }
          }
        } else {
          console.warn(
            `[sandboxes.start] Unknown agent: ${body.agentName}, skipping agent startup`,
          );
        }
      }

      await providerAuthPromise;

      return c.json({
        instanceId: instance.id,
        vscodeUrl: vscodeService.url,
        workerUrl: workerService.url,
        vncUrl: vncService?.url,
        xtermUrl: xtermService?.url,
        provider: provider === "pve-lxc" ? "pve-lxc" : "morph",
        vscodePersisted,
      });
    } catch (error) {
      if (error instanceof HTTPException) {
        const message =
          typeof error.message === "string" && error.message.length > 0
            ? error.message
            : "Request failed";
        return c.text(message, error.status);
      }
      console.error("Failed to start sandbox:", error);
      const errorMessage = getSandboxStartErrorMessage(error);
      return c.text(errorMessage, 500);
    }
  },
);

sandboxesStartRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/prewarm",
    tags: ["Sandboxes"],
    summary: "Prewarm a sandbox instance for a repo",
    description:
      "Creates a Morph instance in the background with the repo already cloned. " +
      "Call this when the user starts typing a task description for faster startup.",
    request: {
      body: {
        content: {
          "application/json": {
            schema: PrewarmSandboxBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: PrewarmSandboxResponse,
          },
        },
        description: "Prewarm entry created (provisioning in background)",
      },
      401: { description: "Unauthorized" },
      500: { description: "Failed to create prewarm entry" },
    },
  }),
  async (c) => {
    const user = await stackServerAppJs.getUser({ tokenStore: c.req.raw });
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const providerConfig = getActiveSandboxProvider();
    if (providerConfig.provider !== "morph") {
      return c.json({ id: "", alreadyExists: true });
    }

    const body = c.req.valid("json");

    try {
      const convex = getConvex({ accessToken });

      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId: body.teamSlugOrId,
      });

      const snapshotId = DEFAULT_MORPH_SNAPSHOT_ID;
      const result = await convex.mutation(api.warmPool.createPrewarmEntry, {
        teamId: team.uuid,
        userId: user.id,
        snapshotId,
        repoUrl: body.repoUrl,
        branch: body.branch,
      });

      if (result.alreadyExists) {
        return c.json({ id: result.id, alreadyExists: true });
      }

      const githubAccountPromise = user.getConnectedAccount("github");
      const prewarmEntryId = result.id;
      void (async () => {
        try {
          const client = getMorphClient();

          let morphInstance = await client.instances.start({
            snapshotId,
            ttlSeconds: 3600,
            ttlAction: "pause",
            metadata: {
              app: "cmux-warm-pool",
              teamId: team.uuid,
              userId: user.id,
            },
          });

          if (morphInstance.networking.httpServices.length === 0) {
            morphInstance = await client.instances.get({
              instanceId: morphInstance.id,
            });
          }

          const instance = wrapMorphInstance(morphInstance);
          void (async () => {
            await instance.setWakeOn(true, true);
          })();

          const exposed = instance.networking.httpServices;
          const vscodeService = exposed.find((service) => service.port === 39378);
          const workerService = exposed.find((service) => service.port === 39377);
          if (!vscodeService || !workerService) {
            throw new Error(
              `VSCode or worker service not found on instance ${instance.id}`,
            );
          }

          await waitForVSCodeReady(vscodeService.url, { timeoutMs: 30_000 });

          const githubAccount = await githubAccountPromise;
          if (githubAccount) {
            const { accessToken: githubAccessToken } =
              await githubAccount.getAccessToken();
            if (githubAccessToken) {
              await configureGithubAccess(instance, githubAccessToken);
            }
          }

          if (body.repoUrl) {
            const parsedRepo = parseGithubRepoUrl(body.repoUrl);
            if (parsedRepo) {
              await hydrateWorkspace({
                instance,
                repo: {
                  owner: parsedRepo.owner,
                  name: parsedRepo.repo,
                  repoFull: parsedRepo.fullName,
                  cloneUrl: parsedRepo.gitUrl,
                  maskedCloneUrl: parsedRepo.gitUrl,
                  depth: 1,
                  baseBranch: body.branch || "main",
                  newBranch: "",
                },
              });
            }
          }

          await convex.mutation(api.warmPool.markInstanceReady, {
            id: prewarmEntryId,
            instanceId: instance.id,
            vscodeUrl: vscodeService.url,
            workerUrl: workerService.url,
          });
        } catch (error) {
          console.error("[sandboxes.prewarm] Background provisioning failed:", error);
          try {
            await convex.mutation(api.warmPool.markInstanceFailed, {
              id: prewarmEntryId,
              errorMessage: error instanceof Error ? error.message : String(error),
            });
          } catch (markError) {
            console.error(
              "[sandboxes.prewarm] Failed to mark entry as failed:",
              markError,
            );
          }
        }
      })();

      return c.json({ id: result.id, alreadyExists: false });
    } catch (error) {
      console.error("[sandboxes.prewarm] Failed:", error);
      return c.text("Failed to create prewarm entry", 500);
    }
  },
);
