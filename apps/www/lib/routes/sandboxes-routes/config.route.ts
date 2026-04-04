/**
 * Sandbox Configuration Routes
 *
 * Endpoints for configuring sandbox instances:
 * - POST /sandboxes/{id}/setup-providers - Set up provider auth (Claude + Codex)
 * - POST /sandboxes/{id}/refresh-github-auth - Refresh GitHub authentication
 * - POST /sandboxes/{id}/env - Apply environment variables
 * - POST /sandboxes/{id}/run-scripts - Run maintenance and dev scripts
 */

import {
  createRoute, OpenAPIHono
} from "@hono/zod-openapi";
import { HTTPException } from "hono/http-exception";
import { RUNTIME_PROVIDERS, SNAPSHOT_PROVIDERS } from "@cmux/shared/provider-types";
import {
  z,
  api,
  env,
  getAccessTokenFromRequest,
  getUserFromRequest,
  getConvex,
  verifyTeamAccess,
  isPveLxcInstanceId,
  getInstanceById,
  tryGetInstanceById,
  getInstanceTeamId,
  parseGithubRepoUrl,
  UpdateSandboxEnvBody,
  UpdateSandboxEnvResponse,
} from "./_helpers";
import {
  getMorphClientOrNull,
  setupProviderAuth,
  configureGithubAccess,
  getFreshGitHubToken,
  generateGitHubInstallationToken,
  encodeEnvContentForEnvctl,
  envctlLoadCommand,
  allocateScriptIdentifiers,
  runMaintenanceAndDevScripts,
} from "./_helpers";

export const sandboxesConfigRouter = new OpenAPIHono();

// ============================================================================
// Schemas
// ============================================================================

const SetupProvidersBody = z
  .object({
    teamSlugOrId: z.string(),
    repoUrl: z.string().optional(),
    taskRunId: z.string().optional(),
    taskRunJwt: z.string().optional(),
  })
  .openapi("SetupProvidersBody");

const SetupProvidersResponse = z
  .object({
    success: z.boolean(),
    providers: z.array(z.string()),
  })
  .openapi("SetupProvidersResponse");

const RecordSandboxCreateBody = z
  .object({
    teamSlugOrId: z.string(),
    provider: z.enum(RUNTIME_PROVIDERS),
    vmid: z.number().optional(),
    hostname: z.string().optional(),
    snapshotId: z.string().optional(),
    snapshotProvider: z.enum(SNAPSHOT_PROVIDERS).optional(),
    templateVmid: z.number().optional(),
    isCloudWorkspace: z.boolean().optional(),
  })
  .openapi("RecordSandboxCreateBody");

const RecordSandboxCreateResponse = z
  .object({
    success: z.literal(true),
  })
  .openapi("RecordSandboxCreateResponse");

const SandboxRefreshGitHubAuthBody = z
  .object({
    teamSlugOrId: z.string(),
  })
  .openapi("SandboxRefreshGitHubAuthBody");

const SandboxRefreshGitHubAuthResponse = z
  .object({
    refreshed: z.literal(true),
  })
  .openapi("SandboxRefreshGitHubAuthResponse");

const RunScriptsBody = z
  .object({
    teamSlugOrId: z.string(),
    maintenanceScript: z.string().optional(),
    devScript: z.string().optional(),
  })
  .openapi("RunScriptsBody");

const RunScriptsResponse = z
  .object({
    started: z.literal(true),
  })
  .openapi("RunScriptsResponse");

async function getAuthorizedSandboxContext(
  request: Request,
  instanceId: string,
  teamSlugOrId: string,
  purpose: string,
) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return {
      ok: false as const,
      response: new Response("Unauthorized", { status: 401 }),
    };
  }

  const { accessToken } = await user.getAuthJson();
  if (!accessToken) {
    return {
      ok: false as const,
      response: new Response("Unauthorized", { status: 401 }),
    };
  }

  const convex = getConvex({ accessToken });
  const team = await verifyTeamAccess({ req: request, teamSlugOrId });
  const morphClient = getMorphClientOrNull();
  const instance = await tryGetInstanceById(instanceId, morphClient, purpose);
  if (!instance) {
    return {
      ok: false as const,
      response: new Response("Instance not found", { status: 404 }),
    };
  }

  return {
    ok: true as const,
    convex,
    team,
    instance,
  };
}

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /sandboxes/{id}/record-create
 * Record sandbox ownership/activity for instances created outside the normal start route.
 */
sandboxesConfigRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/record-create",
    tags: ["Sandboxes"],
    summary: "Record sandbox ownership metadata",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "Sandbox instance ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: RecordSandboxCreateBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RecordSandboxCreateResponse,
          },
        },
        description: "Sandbox ownership recorded",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Instance not found" },
    },
  }),
  async (c) => {
    try {
      const instanceId = c.req.param("id");
      const body = c.req.valid("json");
      const authContext = await getAuthorizedSandboxContext(
        c.req.raw,
        instanceId,
        body.teamSlugOrId,
        "record-create",
      );
      if (!authContext.ok) {
        return c.body(await authContext.response.text(), authContext.response.status as 401 | 404);
      }
      const { convex } = authContext;

      await convex.mutation(api.sandboxInstances.recordCreate, {
        instanceId,
        provider: body.provider,
        vmid: body.vmid,
        hostname: body.hostname,
        snapshotId: body.snapshotId,
        snapshotProvider: body.snapshotProvider,
        templateVmid: body.templateVmid,
        teamSlugOrId: body.teamSlugOrId,
        isCloudWorkspace: body.isCloudWorkspace,
      });

      return c.json({ success: true as const });
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("[record-create] Failed:", error);
      return c.text("Failed to record sandbox ownership", 500);
    }
  },
);

/**
 * POST /sandboxes/{id}/setup-providers
 * Set up provider auth (Claude + Codex) on an existing sandbox instance.
 */
sandboxesConfigRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/setup-providers",
    tags: ["Sandboxes"],
    summary: "Set up provider auth on an existing sandbox",
    description:
      "Configures Claude and Codex CLI auth (API keys, OAuth tokens, settings files) " +
      "on an existing sandbox instance so coding CLIs work out of the box.",
    request: {
      params: z.object({
        id: z.string().openapi({ description: "Sandbox instance ID" }),
      }),
      body: {
        content: {
          "application/json": {
            schema: SetupProvidersBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SetupProvidersResponse,
          },
        },
        description: "Provider auth configured",
      },
      401: { description: "Unauthorized" },
      404: { description: "Instance not found" },
      500: { description: "Failed to set up providers" },
    },
  }),
  async (c) => {
    const { id: instanceId } = c.req.valid("param");
    const body = c.req.valid("json");

    try {
      const authContext = await getAuthorizedSandboxContext(
        c.req.raw,
        instanceId,
        body.teamSlugOrId,
        "setup-providers",
      );
      if (!authContext.ok) {
        return c.body(await authContext.response.text(), authContext.response.status as 401 | 404);
      }
      const { convex, team, instance } = authContext;

      // Verify sandbox ownership - check activity record first, fall back to instance metadata
      if (isPveLxcInstanceId(instanceId)) {
        const activity = await convex.query(api.sandboxInstances.getActivity, {
          instanceId,
        });
        // Require activity record for PVE instances to prove ownership
        // This prevents users from targeting arbitrary PVE instance IDs
        if (!activity) {
          return c.text("Forbidden: No ownership record for this instance", 403);
        }
        if (activity.teamId && activity.teamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }
      } else {
        // For Morph instances, verify team ownership via metadata
        const metadataTeamId = getInstanceTeamId(instance);
        if (metadataTeamId && metadataTeamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }
      }

      const callbackUrl =
        env.NEXT_PUBLIC_CONVEX_URL || "http://localhost:9779";
      const parsedRepoUrl = body.repoUrl
        ? parseGithubRepoUrl(body.repoUrl)
        : null;
      const [previousKnowledge, previousMailbox] = await Promise.all([
        convex
          .query(api.agentMemoryQueries.getLatestTeamKnowledge, {
            teamSlugOrId: body.teamSlugOrId,
          })
          .catch((err: unknown) => {
            console.error(
              "[setup-providers] Failed to fetch previous team knowledge (non-fatal):",
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
              "[setup-providers] Failed to fetch previous team mailbox (non-fatal):",
              err,
            );
            return null;
          }),
      ]);
      const result = await setupProviderAuth(instance, convex, {
        teamId: team.uuid,
        teamSlugOrId: body.teamSlugOrId,
        projectFullName: parsedRepoUrl?.fullName,
        taskRunId: body.taskRunId,
        taskRunJwt: body.taskRunJwt,
        callbackUrl,
        previousKnowledge,
        previousMailbox,
      });

      return c.json({
        success: true,
        providers: result.providers,
      });
    } catch (error) {
      // Re-throw HTTPException to preserve proper status codes (403, 404, etc.)
      if (error instanceof HTTPException) {
        throw error;
      }
      console.error("[setup-providers] Failed:", error);
      return c.text("Failed to set up providers", 500);
    }
  },
);

/**
 * POST /sandboxes/{id}/refresh-github-auth
 * Refresh GitHub authentication inside a sandbox.
 */
sandboxesConfigRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/refresh-github-auth",
    tags: ["Sandboxes"],
    summary: "Refresh GitHub authentication inside a sandbox",
    description:
      "Fetches a fresh GitHub token via Stack Auth and re-authenticates the GitHub CLI inside the sandbox.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: SandboxRefreshGitHubAuthBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: SandboxRefreshGitHubAuthResponse,
          },
        },
        description: "GitHub authentication refreshed successfully",
      },
      400: { description: "Unsupported sandbox provider" },
      401: { description: "Unauthorized or GitHub not connected" },
      403: { description: "Forbidden - sandbox does not belong to this team" },
      404: { description: "Sandbox not found" },
      409: { description: "Sandbox is paused/stopped and must be resumed first" },
      500: { description: "Failed to refresh GitHub authentication" },
      503: { description: "Sandbox provider not configured" },
    },
  }),
  async (c) => {
    const user = await getUserFromRequest(c.req.raw);
    if (!user) {
      return c.text("Unauthorized", 401);
    }
    const { accessToken } = await user.getAuthJson();
    if (!accessToken) {
      return c.text("Unauthorized", 401);
    }

    const { id } = c.req.valid("param");
    const { teamSlugOrId } = c.req.valid("json");

    const convex = getConvex({ accessToken });
    const team = await verifyTeamAccess({ req: c.req.raw, teamSlugOrId });

    const activity = await convex.query(api.sandboxInstances.getActivity, {
      instanceId: id,
    });
    if (!activity) {
      return c.text("Sandbox not found", 404);
    }
    if (activity.teamId && activity.teamId !== team.uuid) {
      return c.text("Forbidden", 403);
    }

    const provider =
      activity.provider ||
      (isPveLxcInstanceId(id)
        ? "pve-lxc"
        : id.startsWith("morphvm_")
          ? "morph"
          : undefined);

    // Try to use GitHub App installation token (same logic as /sandboxes/start)
    // to maintain consistency with initial sandbox setup
    let gitAuthToken: string | undefined;

    // Look up the taskRun to get the repo owner for GitHub App token preference
    const taskRun = await convex.query(api.taskRuns.getByContainerName, {
      teamSlugOrId,
      containerName: id,
    });

    if (taskRun) {
      const task = await convex.query(api.tasks.getById, {
        teamSlugOrId,
        id: taskRun.taskId,
      });
      if (task?.projectFullName) {
        const [owner] = task.projectFullName.split("/");
        try {
          const connections = await convex.query(api.github.listProviderConnections, {
            teamSlugOrId,
          });
          const targetConnection = connections.find(
            (co) =>
              co.isActive && co.accountLogin?.toLowerCase() === owner.toLowerCase()
          );
          if (targetConnection) {
            console.log(
              `[sandboxes.refresh-github-auth] Found GitHub App installation ${targetConnection.installationId} for ${owner}`
            );
            gitAuthToken = await generateGitHubInstallationToken({
              installationId: targetConnection.installationId,
              repositories: [task.projectFullName],
              permissions: {
                contents: "write",
                metadata: "read",
                workflows: "write",
                // Required for auto-PR creation via gh pr create
                pull_requests: "write",
              },
            });
            console.log(
              `[sandboxes.refresh-github-auth] Using GitHub App token for git authentication`
            );
          }
        } catch (error) {
          console.error(
            `[sandboxes.refresh-github-auth] Failed to get GitHub App token, falling back to user OAuth:`,
            error
          );
        }
      }
    }

    // Fall back to personal OAuth token if no GitHub App token
    if (!gitAuthToken) {
      const tokenResult = await getFreshGitHubToken(user);
      if ("error" in tokenResult) {
        return c.text(tokenResult.error, tokenResult.status);
      }
      gitAuthToken = tokenResult.token;
      console.log(
        `[sandboxes.refresh-github-auth] Using personal OAuth token for git authentication`
      );
    }

    try {
      if (provider !== "morph" && provider !== "pve-lxc") {
        return c.text("Unsupported sandbox provider", 400);
      }

      console.log(
        `[sandboxes.refresh-github-auth] Fetching instance ${id} (provider=${provider})`
      );
      const instance = await getInstanceById(id, getMorphClientOrNull());
      console.log(
        `[sandboxes.refresh-github-auth] Instance ${id} status=${instance.status}`
      );

      const metadataTeamId = getInstanceTeamId(instance);
      if (metadataTeamId && metadataTeamId !== team.uuid) {
        return c.text("Forbidden", 403);
      }

      // Check instance is active (Morph uses "paused", PVE LXC uses "running" check)
      if (provider === "morph" && instance.status === "paused") {
        return c.text("Instance is paused - resume it first", 409);
      } else if (provider === "pve-lxc" && instance.status !== "running") {
        console.log(
          `[sandboxes.refresh-github-auth] Container ${id} is ${instance.status}, not running`
        );
        return c.text(`Container is ${instance.status} - resume it first`, 409);
      }

      console.log(
        `[sandboxes.refresh-github-auth] Running gh auth login for ${id}`
      );
      await configureGithubAccess(instance, gitAuthToken);

      console.log(
        `[sandboxes.refresh-github-auth] Successfully refreshed GitHub auth for sandbox ${id}`
      );

      return c.json({ refreshed: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[sandboxes.refresh-github-auth] Failed to refresh GitHub auth for sandbox ${id}:`,
        errorMessage
      );
      // Return more specific error message for debugging
      if (errorMessage.includes("exec failed") || errorMessage.includes("cmux-execd")) {
        return c.text("Container exec service not reachable - container may need restart", 503);
      }
      if (errorMessage.includes("not found") || errorMessage.includes("Unable to resolve")) {
        return c.text("Sandbox not found or deleted", 404);
      }
      return c.text(`Failed to refresh GitHub authentication: ${errorMessage.slice(0, 200)}`, 500);
    }
  }
);

/**
 * POST /sandboxes/{id}/env
 * Apply environment variables to a running sandbox.
 */
sandboxesConfigRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/env",
    tags: ["Sandboxes"],
    summary: "Apply environment variables to a running sandbox",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: UpdateSandboxEnvBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: UpdateSandboxEnvResponse,
          },
        },
        description: "Environment variables applied",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to apply environment variables" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const { teamSlugOrId, envVarsContent } = c.req.valid("json");

    try {
      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId,
      });
      const convex = getConvex({ accessToken });

      // For PVE LXC, verify via activity record (metadata not persisted reliably)
      if (isPveLxcInstanceId(id)) {
        const activity = await convex.query(api.sandboxInstances.getActivity, {
          instanceId: id,
        });
        if (!activity || !activity.teamId) {
          return c.text("Sandbox not found", 404);
        }
        if (activity.teamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }
      }

      // Get instance via provider dispatch (use nullable client for PVE-only deployments)
      const instance = await tryGetInstanceById(id, getMorphClientOrNull(), "sandboxes.env");
      if (!instance) {
        return c.text("Sandbox not found", 404);
      }

      // For Morph instances, verify team ownership via metadata
      if (!isPveLxcInstanceId(id)) {
        const metadataTeamId = getInstanceTeamId(instance);
        if (metadataTeamId && metadataTeamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }
      }

      const encodedEnv = encodeEnvContentForEnvctl(envVarsContent);
      const command = envctlLoadCommand(encodedEnv);
      const execResult = await instance.exec(command);
      if (execResult.exit_code !== 0) {
        console.error(
          `[sandboxes.env] envctl load failed exit=${execResult.exit_code} stderr=${(execResult.stderr || "").slice(0, 200)}`,
        );
        return c.text("Failed to apply environment variables", 500);
      }

      return c.json({ applied: true as const });
    } catch (error) {
      console.error(
        "[sandboxes.env] Failed to apply environment variables",
        error,
      );
      return c.text("Failed to apply environment variables", 500);
    }
  },
);

/**
 * POST /sandboxes/{id}/run-scripts
 * Run maintenance and dev scripts in a sandbox.
 */
sandboxesConfigRouter.openapi(
  createRoute({
    method: "post" as const,
    path: "/sandboxes/{id}/run-scripts",
    tags: ["Sandboxes"],
    summary: "Run maintenance and dev scripts in a sandbox",
    description:
      "Runs maintenance and/or dev scripts in tmux sessions within the sandbox. " +
      "This ensures scripts run in a managed way that can be properly cleaned up before snapshotting.",
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          "application/json": {
            schema: RunScriptsBody,
          },
        },
        required: true,
      },
    },
    responses: {
      200: {
        content: {
          "application/json": {
            schema: RunScriptsResponse,
          },
        },
        description: "Scripts started successfully",
      },
      401: { description: "Unauthorized" },
      403: { description: "Forbidden" },
      404: { description: "Sandbox not found" },
      500: { description: "Failed to run scripts" },
    },
  }),
  async (c) => {
    const accessToken = await getAccessTokenFromRequest(c.req.raw);
    if (!accessToken) return c.text("Unauthorized", 401);

    const { id } = c.req.valid("param");
    const { teamSlugOrId, maintenanceScript, devScript } = c.req.valid("json");

    // Need at least one script to run
    if (!maintenanceScript && !devScript) {
      return c.json({ started: true as const });
    }

    try {
      const team = await verifyTeamAccess({
        req: c.req.raw,
        teamSlugOrId,
      });

      // Get instance via provider dispatch (use nullable client for PVE-only deployments)
      const instance = await tryGetInstanceById(id, getMorphClientOrNull(), "sandboxes.run-scripts");
      if (!instance) {
        return c.text("Sandbox not found", 404);
      }

      // For Morph instances, verify team ownership via metadata
      if (!isPveLxcInstanceId(id)) {
        const metadataTeamId = getInstanceTeamId(instance);
        if (metadataTeamId && metadataTeamId !== team.uuid) {
          return c.text("Forbidden", 403);
        }
      }

      // Allocate script identifiers for tracking
      const scriptIdentifiers = allocateScriptIdentifiers();

      // Run scripts in background (don't await)
      (async () => {
        await runMaintenanceAndDevScripts({
          instance,
          maintenanceScript: maintenanceScript || undefined,
          devScript: devScript || undefined,
          identifiers: scriptIdentifiers,
          convexUrl: env.NEXT_PUBLIC_CONVEX_URL,
          isCloudWorkspace: true,
        });
      })().catch((error) => {
        console.error(
          "[sandboxes.run-scripts] Background script execution failed:",
          error,
        );
      });

      return c.json({ started: true as const });
    } catch (error) {
      console.error(
        "[sandboxes.run-scripts] Failed to run scripts",
        error,
      );
      return c.text("Failed to run scripts", 500);
    }
  },
);
