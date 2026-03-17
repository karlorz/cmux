/**
 * HTTP API endpoints for apps/server
 *
 * Option C: Expose agent spawning via HTTP API so CLI can use the same
 * code path as the web app's socket.io "start-task" event.
 *
 * This enables CLI to create tasks with proper agent spawning,
 * identical to the web app flow.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  AGENT_CATALOG,
  getVariantsForVendor,
} from "@cmux/shared/agent-catalog";
import {
  DEFAULT_TASK_LIST_LIMIT,
  ORCHESTRATION_STATUSES,
} from "@cmux/convex/orchestrationQueries";
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import { spawnAgent, spawnAllAgents, type PreFetchedSpawnConfig } from "./agentSpawner";
import { getProviderHealthMonitor } from "@cmux/shared/resilience/provider-health";
import {
  DEFAULT_BRANCH_PREFIX,
  generateBranchNamesFromDescription,
  generatePRInfoAndBranchNames,
} from "./utils/branchNameGenerator";
import { validateBranchName } from "./utils/gitUrl";
import { getConvex } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";
import { extractTaskRunJwt } from "./utils/jwt-helper";
import {
  aggregateByVendor,
  checkAllProvidersStatusWebMode,
} from "./utils/providerStatus";
import { runWithAuth, runWithAuthToken } from "./utils/requestContext";
import { env } from "./utils/server-env";
import { getResponseErrorMessage } from "./utils/httpError";

interface StartTaskRequest {
  // Required fields
  taskId: string;
  taskDescription: string;
  projectFullName: string;
  // Optional fields
  repoUrl?: string;
  branch?: string;
  branchNames?: string[];
  taskRunIds?: string[];
  selectedAgents?: string[];
  isCloudMode?: boolean;
  environmentId?: string;
  theme?: "dark" | "light" | "system";
  prTitle?: string;
  images?: Array<
    | {
        // Inline image data (same shape as StartTaskSchema over socket.io)
        src: string;
        fileName?: string;
        altText: string;
      }
    | {
        // Storage-backed image reference (Convex _storage ID)
        imageId: string;
        fileName?: string;
        altText?: string;
      }
  >;
  // Autopilot mode (Phase 6: Long-Running Sessions)
  autopilot?: boolean;
  autopilotMinutes?: number;
  autopilotTurnMinutes?: number;
  autopilotWrapUp?: number;
}

interface StartTaskResponse {
  taskId: string;
  results: Array<{
    agentName: string;
    taskRunId: string;
    vscodeUrl?: string;
    success: boolean;
    error?: string;
    status?: "spawning";
  }>;
}

function jsonResponse(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function parseAuthHeader(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.slice(7);
}

async function readJsonBody<T>(req: IncomingMessage): Promise<T | null> {
  return new Promise((resolve) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(body) as T);
      } catch {
        resolve(null);
      }
    });
    req.on("error", () => {
      resolve(null);
    });
  });
}

/**
 * Get the Convex site URL for HTTP API calls.
 * Prefers CONVEX_SITE_URL, falls back to NEXT_PUBLIC_CONVEX_URL.
 */
function getConvexSiteUrl(): string {
  const url = env.CONVEX_SITE_URL ?? env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Neither CONVEX_SITE_URL nor NEXT_PUBLIC_CONVEX_URL is configured");
  }
  return url;
}

/**
 * Update an orchestration task's status via the Convex HTTP endpoint.
 * Used by JWT-authenticated paths that cannot use the typed Convex client.
 * Best-effort: logs errors but does not throw.
 */
function updateOrchestrationTaskViaHttp(
  taskRunJwt: string,
  body: {
    orchestrationTaskId: string;
    status: string;
    agentName?: string;
    errorMessage?: string;
  }
): void {
  const convexSiteUrl = getConvexSiteUrl();
  fetch(`${convexSiteUrl}/api/orchestration/tasks/update`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Task-Run-JWT": taskRunJwt,
    },
    body: JSON.stringify(body),
  }).then((updateRes) => {
    if (!updateRes.ok) {
      serverLogger.error("[http-api] Orchestration task status update failed", {
        status: updateRes.status,
        orchestrationTaskId: body.orchestrationTaskId,
      });
    }
  }).catch((err) => {
    serverLogger.error("[http-api] Failed to update orchestration task status", err);
  });
}

/**
 * Handle POST /api/start-task
 *
 * This is the HTTP equivalent of the socket.io "start-task" event.
 * CLI can call this endpoint to spawn agents with the same flow as web app.
 */
async function handleStartTask(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Extract auth token
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  // Construct authHeaderJson from token (same format as Stack Auth x-stack-auth header)
  // This is needed for getWwwClient() to make authenticated requests to www API
  const authHeaderJson = JSON.stringify({ accessToken: authToken });

  // Parse request body
  const body = await readJsonBody<StartTaskRequest & { teamSlugOrId: string }>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const {
    taskId,
    taskDescription,
    projectFullName,
    repoUrl,
    branch,
    branchNames: branchNamesOverride,
    taskRunIds,
    selectedAgents,
    isCloudMode = true, // Default to cloud mode for CLI
    environmentId,
    theme,
    teamSlugOrId,
    prTitle,
    images,
    autopilot,
    autopilotMinutes,
    autopilotTurnMinutes,
    autopilotWrapUp,
  } = body;

  // taskDescription can be empty string for cloud workspaces (interactive TUI session)
  // but must be a string type (not null, undefined, or other types)
  if (!taskId || typeof taskDescription !== "string" || !projectFullName) {
    jsonResponse(res, 400, {
      error: "Missing required fields: taskId, taskDescription (string), projectFullName",
    });
    return;
  }

  if (!teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required field: teamSlugOrId" });
    return;
  }

  serverLogger.info("[http-api] POST /api/start-task", {
    taskId,
    projectFullName,
    selectedAgents,
    isCloudMode,
  });

  try {
    // Validate branchNames override early so we can return 400 (not 500)
    const agentsToSpawnPreview = selectedAgents && selectedAgents.length > 0
      ? selectedAgents
      : ["claude/opus-4.5"];
    // Validate whenever branchNames is present (not just when length > 0)
    // to reject non-array truthy values like `123` or `true`
    if (branchNamesOverride !== undefined && branchNamesOverride !== null) {
      if (!Array.isArray(branchNamesOverride)) {
        jsonResponse(res, 400, { error: "branchNames must be an array of strings" });
        return;
      }
      if (branchNamesOverride.length > 0 && branchNamesOverride.length !== agentsToSpawnPreview.length) {
        jsonResponse(res, 400, {
          error: `branchNames length (${branchNamesOverride.length}) must match selectedAgents length (${agentsToSpawnPreview.length})`,
        });
        return;
      }
      for (const name of branchNamesOverride) {
        if (typeof name !== "string") {
          jsonResponse(res, 400, { error: "branchNames must be an array of strings" });
          return;
        }
        try {
          validateBranchName(name);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Invalid branch name";
          jsonResponse(res, 400, { error: message });
          return;
        }
      }
    }

    // Determine which agents to spawn (pure computation from request body)
    const agentsToSpawn = selectedAgents && selectedAgents.length > 0 ? selectedAgents : ["claude/opus-4.5"];

    // Build 202 response immediately - no auth or DB calls needed
    const responseResults = agentsToSpawn.map((agentName, i) => ({
      agentName,
      taskRunId: taskRunIds?.[i] ?? "",
      status: "spawning" as const,
      success: true,
      vscodeUrl: undefined,
    }));

    serverLogger.info("[http-api] start-task returning 202 (async spawn)", {
      taskId,
      resultCount: responseResults.length,
    });

    jsonResponse(res, 202, {
      taskId,
      results: responseResults,
    } satisfies StartTaskResponse);

    // Fire-and-forget: all authenticated work + spawn in background
    // spawnAllAgents already updates Convex task run status on success/failure
    void runWithAuth(authToken, authHeaderJson, async () => {
      const agentCount = agentsToSpawn.length;

      // Fetch workspace settings for branchPrefix (same as socket.io handler)
      const workspaceSettings = await getConvex().query(
        api.workspaceSettings.get,
        { teamSlugOrId }
      );
      const branchPrefix =
        workspaceSettings?.branchPrefix !== undefined
          ? workspaceSettings.branchPrefix
          : DEFAULT_BRANCH_PREFIX;

      // Generate branch names for agents
      let branchNames: string[] | undefined;
      if (branchNamesOverride && branchNamesOverride.length > 0) {
        branchNames = branchNamesOverride;
      } else if (agentsToSpawn.length > 0) {
        branchNames = generateBranchNamesFromDescription(
          taskDescription,
          agentsToSpawn.length,
          branchPrefix
        );
      }

      // Save PR title when provided (so auto-PR uses it later)
      if (prTitle && prTitle.trim().length > 0) {
        await getConvex().mutation(api.tasks.setPullRequestTitle, {
          teamSlugOrId,
          id: taskId as Id<"tasks">,
          pullRequestTitle: prTitle,
        });
      }

      // Fire-and-forget: generate AI PR title asynchronously (non-blocking)
      if (!prTitle || prTitle.trim().length === 0) {
        void (async () => {
          try {
            const prInfo = await generatePRInfoAndBranchNames(
              taskDescription,
              agentCount,
              teamSlugOrId
            );
            await getConvex().mutation(api.tasks.setPullRequestTitle, {
              teamSlugOrId,
              id: taskId as Id<"tasks">,
              pullRequestTitle: prInfo.prTitle,
            });
            serverLogger.info(
              `[http-api] AI-generated PR title saved: "${prInfo.prTitle}"`
            );
          } catch (e) {
            serverLogger.error(
              "[http-api] Failed generating PR title (non-blocking):",
              e
            );
          }
        })();
      }

      // Normalize images: accept either inline base64 (src) or storage IDs (imageId)
      let imagesForSpawner:
        | Array<{ src: string; fileName?: string; altText: string }>
        | undefined;
      if (images && images.length > 0) {
        const inline = images.filter(
          (img): img is { src: string; fileName?: string; altText: string } =>
            "src" in img && typeof img.src === "string"
        );
        const refs = images.filter(
          (
            img
          ): img is { imageId: string; fileName?: string; altText?: string } =>
            "imageId" in img && typeof img.imageId === "string"
        );

        if (refs.length > 0) {
          const storageIds = refs.map((img) => img.imageId as Id<"_storage">);
          const urls = await getConvex().query(api.storage.getUrls, {
            teamSlugOrId,
            storageIds,
          });
          const downloaded = await Promise.all(
            refs.map(async (img, index) => {
              const url = urls.find((u) => u.storageId === img.imageId);
              if (!url) {
                return null;
              }
              const response = await fetch(url.url);
              const buffer = await response.arrayBuffer();
              const base64 = Buffer.from(buffer).toString("base64");
              const mime =
                response.headers.get("content-type") ?? "image/png";
              const fileName = img.fileName;
              const altText =
                img.altText?.trim().length
                  ? img.altText
                  : fileName || `image_${index + 1}`;
              const base = {
                src: `data:${mime};base64,${base64}`,
                altText,
              };
              return fileName ? { ...base, fileName } : base;
            })
          );

          imagesForSpawner = downloaded.filter(
            (img): img is { src: string; fileName?: string; altText: string } =>
              img !== null
          );
        }

        if (inline.length > 0) {
          imagesForSpawner = [
            ...(imagesForSpawner ?? []),
            ...inline,
          ];
        }
      }

      await spawnAllAgents(
        taskId as Id<"tasks">,
        {
          repoUrl,
          branch,
          taskDescription,
          prTitle,
          branchNames,
          selectedAgents: agentsToSpawn,
          taskRunIds: taskRunIds as Id<"taskRuns">[] | undefined,
          isCloudMode,
          environmentId: environmentId as Id<"environments"> | undefined,
          images: imagesForSpawner,
          theme,
          autopilotOptions: autopilot
            ? {
                enabled: true,
                totalMinutes: autopilotMinutes ?? 30,
                turnMinutes: autopilotTurnMinutes ?? 5,
                wrapUpMinutes: autopilotWrapUp ?? 3,
              }
            : undefined,
        },
        teamSlugOrId
      );
    }).catch((error) => {
      serverLogger.error("[http-api] Background spawn failed", error);
    });
  } catch (error) {
    serverLogger.error("[http-api] start-task failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

// ============================================================================
// Cloud Workspace Endpoint
// ============================================================================

interface CreateCloudWorkspaceRequest {
  teamSlugOrId: string;
  taskId: string;
  environmentId?: string;
  projectFullName?: string;
  repoUrl?: string;
  theme?: "dark" | "light" | "system";
}

interface CreateCloudWorkspaceResponse {
  success: boolean;
  taskId: string;
  taskRunId: string;
  vscodeUrl?: string;
  vncUrl?: string;
  error?: string;
}

/**
 * Handle POST /api/create-cloud-workspace
 *
 * Creates a cloud workspace without running an agent - just spawns a sandbox
 * with VSCode access. This matches the web UI's "create-cloud-workspace" socket event.
 */
async function handleCreateCloudWorkspace(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  // Construct authHeaderJson from token (same format as Stack Auth x-stack-auth header)
  const authHeaderJson = JSON.stringify({ accessToken: authToken });

  const body = await readJsonBody<CreateCloudWorkspaceRequest>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { teamSlugOrId, taskId, environmentId, projectFullName, repoUrl } = body;

  if (!teamSlugOrId || !taskId) {
    jsonResponse(res, 400, { error: "Missing required fields: teamSlugOrId, taskId" });
    return;
  }

  // Require either environmentId or projectFullName to avoid sandbox start failures
  if (!environmentId && !projectFullName) {
    jsonResponse(res, 400, { error: "Missing required field: environmentId or projectFullName" });
    return;
  }

  serverLogger.info("[http-api] POST /api/create-cloud-workspace", {
    taskId,
    environmentId,
    projectFullName,
  });

  // Hoist taskRunId outside runWithAuth to handle failures properly
  let createdTaskRunId: string | null = null;

  try {
    await runWithAuth(authToken, authHeaderJson, async () => {
      const convex = getConvex();
      const now = Date.now();

      // Create a taskRun for the workspace (agentName: "cloud-workspace")
      const taskRunResult = await convex.mutation(api.taskRuns.create, {
        teamSlugOrId,
        taskId: taskId as Id<"tasks">,
        prompt: "Cloud Workspace",
        agentName: "cloud-workspace",
        environmentId: environmentId as Id<"environments"> | undefined,
      });
      const taskRunId = taskRunResult.taskRunId;
      createdTaskRunId = taskRunId; // Save for error handling
      const taskRunJwt = taskRunResult.jwt;

      serverLogger.info(
        `[create-cloud-workspace] Created taskRun ${taskRunId} for task ${taskId}`
      );

      // Update initial VSCode status
      await convex.mutation(api.taskRuns.updateVSCodeInstance, {
        teamSlugOrId,
        id: taskRunId,
        vscode: {
          provider: "morph",
          status: "starting",
          startedAt: now,
        },
      });

      await convex.mutation(api.taskRuns.updateStatusPublic, {
        teamSlugOrId,
        id: taskRunId,
        status: "pending",
      });

      // Spawn sandbox via www API
      const { getWwwClient } = await import("./utils/wwwClient");
      const { getWwwOpenApiModule } = await import("./utils/wwwOpenApiModule");
      const { postApiSandboxesStart, postApiSandboxesByIdPublishDevcontainer } =
        await getWwwOpenApiModule();

      serverLogger.info(
        environmentId
          ? `[create-cloud-workspace] Starting sandbox for environment ${environmentId}`
          : `[create-cloud-workspace] Starting sandbox for repo ${projectFullName}`
      );

      const startRes = await postApiSandboxesStart({
        client: getWwwClient(),
        body: {
          teamSlugOrId,
          ttlSeconds: 60 * 60,
          metadata: {
            instance: `cmux-workspace-${taskRunId}`,
            agentName: "cloud-workspace",
          },
          taskRunId,
          taskRunJwt,
          isCloudWorkspace: true,
          ...(environmentId
            ? { environmentId }
            : { projectFullName, repoUrl }),
        },
      });

      const data = startRes.data;
      if (!data) {
        const errorText = startRes.error ? JSON.stringify(startRes.error) : "Unknown sandbox start error";
        throw new Error(`Failed to start sandbox: ${errorText}`);
      }

      const sandboxId = data.instanceId;
      const sandboxProvider = data.provider ?? "morph";
      const vscodeBaseUrl = data.vscodeUrl;
      const vncUrl = data.vncUrl;
      const xtermUrl = data.xtermUrl;
      const workspaceUrl = `${vscodeBaseUrl}?folder=/root/workspace`;

      serverLogger.info(
        `[create-cloud-workspace] Sandbox started: ${sandboxId}, VSCode URL: ${workspaceUrl}`
      );

      // Update taskRun with actual VSCode info
      await convex.mutation(api.taskRuns.updateVSCodeInstance, {
        teamSlugOrId,
        id: taskRunId,
        vscode: {
          provider: sandboxProvider,
          containerName: sandboxId,
          status: "running",
          url: vscodeBaseUrl,
          workspaceUrl,
          vncUrl,
          xtermUrl,
          startedAt: now,
        },
      });

      await convex.mutation(api.taskRuns.updateStatusPublic, {
        teamSlugOrId,
        id: taskRunId,
        status: "running",
      });

      await convex.mutation(api.taskRuns.updateVSCodeStatus, {
        teamSlugOrId,
        id: taskRunId,
        status: "running",
      });

      try {
        await postApiSandboxesByIdPublishDevcontainer({
          client: getWwwClient(),
          path: { id: sandboxId },
          body: { teamSlugOrId, taskRunId },
        });
        serverLogger.info(
          `[create-cloud-workspace] Published forwarded ports for taskRun ${taskRunId}`
        );
      } catch (publishError) {
        serverLogger.warn(
          `[create-cloud-workspace] Failed to publish forwarded ports for taskRun ${taskRunId} (non-fatal)`,
          publishError
        );
      }

      serverLogger.info("[http-api] create-cloud-workspace completed", {
        taskId,
        taskRunId,
        sandboxId,
      });

      jsonResponse(res, 200, {
        success: true,
        taskId,
        taskRunId,
        vscodeUrl: workspaceUrl,
        vncUrl,
      } satisfies CreateCloudWorkspaceResponse);
    });
  } catch (error) {
    serverLogger.error("[http-api] create-cloud-workspace failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";

    // If taskRun was created, mark it as failed to avoid orphaned state
    if (createdTaskRunId) {
      try {
        await runWithAuth(authToken, authHeaderJson, async () => {
          await getConvex().mutation(api.taskRuns.failByTeamMember, {
            teamSlugOrId,
            id: createdTaskRunId as Id<"taskRuns">,
            errorMessage: `Cloud workspace creation failed: ${message}`,
            exitCode: 1,
          });
        });
        serverLogger.info(`[http-api] Marked orphaned taskRun ${createdTaskRunId} as failed`);
      } catch (cleanupError) {
        serverLogger.error("[http-api] Failed to mark orphaned taskRun as failed", cleanupError);
      }
    }

    jsonResponse(res, 500, {
      success: false,
      taskId,
      taskRunId: createdTaskRunId ?? "",
      error: message,
    });
  }
}

// ============================================================================
// Orchestration Endpoints
// ============================================================================

interface OrchestrationSpawnRequest {
  teamSlugOrId: string;
  prompt: string;
  agent: string;
  repo?: string;
  branch?: string;
  prTitle?: string;
  environmentId?: string;
  isCloudMode?: boolean;
  dependsOn?: string[];  // Orchestration task IDs this task depends on
  priority?: number;     // Task priority (1=highest, 10=lowest, default 5)
  orchestrationId?: string; // Orchestration ID for grouping tasks
  isCloudWorkspace?: boolean; // Mark as cloud workspace (long-lived, not auto-paused)
  isOrchestrationHead?: boolean; // Mark as orchestration head agent (can spawn sub-agents)
}

interface OrchestrationSpawnResponse {
  orchestrationTaskId: string;
  taskId: string;
  taskRunId: string;
  agentName: string;
  vscodeUrl?: string;
  status: string;
}

interface OrchestrationTaskLike {
  _id: string;
  status: string;
  prompt?: string;
  result?: string | null;
  errorMessage?: string | null;
  taskRunId?: string | null;
  assignedAgentName?: string | null;
  completedAt?: number | null;
  metadata?: Record<string, unknown> | null;
}

export function matchesOrchestrationTaskGroup(
  task: OrchestrationTaskLike,
  orchestrationId: string,
): boolean {
  if (task._id === orchestrationId) {
    return true;
  }
  return task.metadata?.orchestrationId === orchestrationId;
}

function summarizeOrchestrationTasks(tasks: OrchestrationTaskLike[]) {
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const pendingCount = tasks.filter((task) => task.status === "pending").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const runningCount = tasks.filter(
    (task) => task.status === "running" || task.status === "assigned",
  ).length;

  return {
    completedCount,
    pendingCount,
    failedCount,
    runningCount,
  };
}

/**
 * Handle POST /api/orchestrate/spawn
 *
 * Creates orchestration tracking records and spawns an agent.
 * This creates a tasks record, taskRuns record, and orchestrationTasks record,
 * then uses spawnAgent() to start the agent.
 *
 * Supports two authentication methods:
 * 1. Bearer token (Stack Auth) - Standard user authentication
 * 2. X-Task-Run-JWT - Allows agents to spawn sub-agents using their task-run JWT
 */
async function handleOrchestrationSpawn(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Parse request body first (needed to check teamSlugOrId)
  const body = await readJsonBody<OrchestrationSpawnRequest>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { teamSlugOrId, prompt, agent, repo, branch, prTitle, environmentId, isCloudMode = true, dependsOn, priority, orchestrationId, isCloudWorkspace, isOrchestrationHead } = body;

  // Check for JWT auth first (allows agents to spawn sub-agents)
  const taskRunJwt = extractTaskRunJwt(req.headers as Record<string, string | string[] | undefined>);
  const authToken = parseAuthHeader(req);

  // For JWT auth, teamSlugOrId is embedded in the token, so only require prompt and agent
  // For Bearer auth, all three are required
  if (!prompt || !agent) {
    jsonResponse(res, 400, { error: "Missing required fields: prompt, agent" });
    return;
  }

  if (!taskRunJwt && !teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required field: teamSlugOrId (required for Bearer auth)" });
    return;
  }

  if (!taskRunJwt && !authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token or X-Task-Run-JWT header" });
    return;
  }

  serverLogger.info("[http-api] POST /api/orchestrate/spawn", {
    agent,
    prompt: prompt.slice(0, 100),
    authMethod: taskRunJwt ? "jwt" : "bearer",
  });

  try {
    // JWT-based auth path (for sub-agent spawning)
    if (taskRunJwt) {
      // Find the agent config
      const agentConfig = AGENT_CONFIGS.find((a) => a.name === agent);
      if (!agentConfig) {
        throw new Error(`Agent not found: ${agent}`);
      }

      // Call Convex HTTP endpoint to create task and run (handles JWT validation internally)
      const convexSiteUrl = getConvexSiteUrl();
      const taskAndRunResponse = await fetch(`${convexSiteUrl}/api/orchestration/task-and-run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Task-Run-JWT": taskRunJwt,
        },
        body: JSON.stringify({
          text: prompt,
          projectFullName: repo ?? "",
          baseBranch: branch,
          prompt,
          agentName: agent,
          environmentId,
          pullRequestTitle: prTitle,
        }),
      });

      if (!taskAndRunResponse.ok) {
        const errorMessage = await getResponseErrorMessage(taskAndRunResponse);
        throw new Error(`Failed to create task and run: ${errorMessage}`);
      }

      const { taskId, taskRunId, jwt: newJwt } = await taskAndRunResponse.json() as {
        taskId: string;
        taskRunId: string;
        jwt: string;
      };

      // Create orchestration task record
      const orchestrationTaskResponse = await fetch(`${convexSiteUrl}/api/orchestration/tasks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Task-Run-JWT": taskRunJwt,
        },
        body: JSON.stringify({
          prompt,
          taskId,
          taskRunId,
          priority: priority ?? 5,
          dependencies: dependsOn,
          orchestrationId,
        }),
      });

      if (!orchestrationTaskResponse.ok) {
        const errorMessage = await getResponseErrorMessage(orchestrationTaskResponse);
        throw new Error(`Failed to create orchestration task: ${errorMessage}`);
      }

      const { orchestrationTaskId } = await orchestrationTaskResponse.json() as { orchestrationTaskId: string };

      // Fetch spawn config (API keys, workspace settings, etc.) via JWT-authenticated endpoint
      // This is needed because spawnAgent needs this data but can't call Convex without Stack Auth
      const spawnConfigResponse = await fetch(`${convexSiteUrl}/api/orchestration/spawn-config`, {
        method: "GET",
        headers: {
          "X-Task-Run-JWT": taskRunJwt,
        },
      });

      if (!spawnConfigResponse.ok) {
        const errorMessage = await getResponseErrorMessage(spawnConfigResponse);
        throw new Error(`Failed to fetch spawn config: ${errorMessage}`);
      }

      const preFetchedConfig = await spawnConfigResponse.json() as PreFetchedSpawnConfig;

      // Return 202 immediately to avoid Cloudflare 524 timeout on slow providers
      jsonResponse(res, 202, {
        orchestrationTaskId,
        taskId,
        taskRunId,
        agentName: agent,
        status: "spawning",
      } satisfies OrchestrationSpawnResponse);

      // Fire-and-forget: spawn agent in background
      void (async () => {
        try {
          const spawnResult = await spawnAgent(
            agentConfig,
            taskId as Id<"tasks">,
            {
              repoUrl: repo,
              branch,
              taskDescription: prompt,
              isCloudMode,
              environmentId: environmentId as Id<"environments"> | undefined,
              taskRunId: taskRunId as Id<"taskRuns">,
              preFetchedConfig,
              isCloudWorkspace,
              isOrchestrationHead,
            },
            teamSlugOrId,
            newJwt
          );

          // Update orchestration task status
          updateOrchestrationTaskViaHttp(taskRunJwt, spawnResult.success
            ? { orchestrationTaskId, status: "running", agentName: agent }
            : { orchestrationTaskId, status: "failed", errorMessage: spawnResult.error ?? "Spawn failed" }
          );
        } catch (error) {
          serverLogger.error("[http-api] Background orchestration spawn failed (jwt path)", error);
          updateOrchestrationTaskViaHttp(taskRunJwt, {
            orchestrationTaskId,
            status: "failed",
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      })();
      return;
    }

    // Bearer token auth path (standard user authentication)
    const authHeaderJson = JSON.stringify({ accessToken: authToken });

    const result = await runWithAuth(authToken, authHeaderJson, async () => {
      // Find the agent config
      const agentConfig = AGENT_CONFIGS.find((a) => a.name === agent);
      if (!agentConfig) {
        throw new Error(`Agent not found: ${agent}`);
      }

      // Get team info via listTeamMemberships
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      // Find matching team by slug or teamId
      const membership = memberships.find(
        (m) => m.team.teamId === teamSlugOrId || m.team.slug === teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      // Create task record (uses 'text' field, not 'prompt')
      const taskResult = await getConvex().mutation(api.tasks.create, {
        teamSlugOrId,
        text: prompt,
        projectFullName: repo ?? "",
        baseBranch: branch,
      });

      const taskId = taskResult.taskId;

      // Create task run record
      const taskRunResult = await getConvex().mutation(api.taskRuns.create, {
        teamSlugOrId,
        taskId,
        prompt,
        agentName: agent,
        newBranch: "",
        environmentId: environmentId as Id<"environments"> | undefined,
      });

      const taskRunId = taskRunResult.taskRunId;

      // Create orchestration task record
      // Convert dependsOn string IDs to Convex IDs if provided
      const dependencyIds = dependsOn?.length
        ? dependsOn.map((id) => id as Id<"orchestrationTasks">)
        : undefined;

      const orchestrationTaskId = await getConvex().mutation(api.orchestrationQueries.createTask, {
        teamSlugOrId,
        prompt,
        taskId,
        taskRunId,
        priority: priority ?? 5,
        dependencies: dependencyIds,
      });

      return {
        orchestrationTaskId: String(orchestrationTaskId),
        taskId: String(taskId),
        taskRunId: String(taskRunId),
        agentName: agent,
        agentConfig,
      };
    });

    // Return 202 immediately to avoid Cloudflare 524 timeout on slow providers
    jsonResponse(res, 202, {
      orchestrationTaskId: result.orchestrationTaskId,
      taskId: result.taskId,
      taskRunId: result.taskRunId,
      agentName: result.agentName,
      status: "spawning",
    } satisfies OrchestrationSpawnResponse);

    // Fire-and-forget: spawn agent in background
    void runWithAuth(authToken, authHeaderJson, async () => {
      const spawnResult = await spawnAgent(
        result.agentConfig,
        result.taskId as Id<"tasks">,
        {
          repoUrl: repo,
          branch,
          taskDescription: prompt,
          isCloudMode,
          environmentId: environmentId as Id<"environments"> | undefined,
          taskRunId: result.taskRunId as Id<"taskRuns">,
          isCloudWorkspace,
          isOrchestrationHead,
        },
        teamSlugOrId
      );

      // Update orchestration task with assignment
      if (spawnResult.success) {
        await getConvex().mutation(api.orchestrationQueries.assignAndStartTask, {
          taskId: result.orchestrationTaskId as Id<"orchestrationTasks">,
          agentName: agent,
        });
      } else {
        await getConvex().mutation(api.orchestrationQueries.failTask, {
          taskId: result.orchestrationTaskId as Id<"orchestrationTasks">,
          errorMessage: spawnResult.error ?? "Spawn failed",
        });
      }
    }).catch((error) => {
      serverLogger.error("[http-api] Background orchestration spawn failed (bearer path)", error);
    });
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/spawn failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Handle GET /api/orchestrate/list
 *
 * Returns orchestration tasks for a team with optional status filter.
 */
async function handleOrchestrationList(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const teamSlugOrId = url.searchParams.get("teamSlugOrId");
  const statusParam = url.searchParams.get("status");
  const cursor = url.searchParams.get("cursor");

  // Validate status parameter if provided
  type OrchestrationStatus = (typeof ORCHESTRATION_STATUSES)[number];
  if (statusParam && !ORCHESTRATION_STATUSES.includes(statusParam as OrchestrationStatus)) {
    jsonResponse(res, 400, {
      error: `Invalid status parameter: ${statusParam}. Must be one of: ${ORCHESTRATION_STATUSES.join(", ")}`,
    });
    return;
  }
  const status = statusParam as OrchestrationStatus | null;

  if (!teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required query parameter: teamSlugOrId" });
    return;
  }

  try {
    const result = await runWithAuthToken(authToken, async () => {
      // Get team info via listTeamMemberships
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      const membership = memberships.find(
        (m) => m.team.teamId === teamSlugOrId || m.team.slug === teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      if (status) {
        const paginatedTasks = await getConvex().query(
          api.orchestrationQueries.listTasksByTeamPaginated,
          {
            teamSlugOrId: membership.team.teamId,
            status,
            paginationOpts: {
              cursor,
              numItems: DEFAULT_TASK_LIST_LIMIT,
            },
          }
        );

        return {
          tasks: paginatedTasks.page,
          nextCursor: paginatedTasks.continueCursor,
          isDone: paginatedTasks.isDone,
        };
      }

      const tasks = await getConvex().query(api.orchestrationQueries.listTasksByTeam, {
        teamSlugOrId: membership.team.teamId,
        limit: DEFAULT_TASK_LIST_LIMIT,
      });

      return { tasks };
    });

    jsonResponse(res, 200, result);
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/list failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Handle GET /api/orchestrate/status/*
 *
 * Returns status details for a specific orchestration task.
 */
async function handleOrchestrationStatus(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const teamSlugOrId = url.searchParams.get("teamSlugOrId");

  // Extract orchestration task ID from path: /api/orchestrate/status/<id>
  const pathParts = url.pathname.split("/");
  const orchestrationTaskId = pathParts[pathParts.length - 1];

  if (!teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required query parameter: teamSlugOrId" });
    return;
  }

  if (!orchestrationTaskId || orchestrationTaskId === "status") {
    jsonResponse(res, 400, { error: "Missing orchestration task ID in path" });
    return;
  }

  try {
    const result = await runWithAuthToken(authToken, async () => {
      // Verify team membership first
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      const membership = memberships.find(
        (m) => m.team.teamId === teamSlugOrId || m.team.slug === teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      const task = await getConvex().query(api.orchestrationQueries.getTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
        teamSlugOrId: membership.team.teamId,
      });

      if (!task) {
        throw new Error("Orchestration task not found");
      }

      // Enrich with taskRun details if available
      let taskRun = null;
      if (task.taskRunId) {
        try {
          taskRun = await getConvex().query(api.taskRuns.get, {
            teamSlugOrId,
            id: task.taskRunId,
          });
        } catch {
          // Task run might not exist, continue without it
        }
      }

      return {
        task,
        taskRun,
      };
    });

    jsonResponse(res, 200, result);
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/status failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Handle GET /api/orchestrate/results/*
 *
 * Returns aggregated results from all sub-agents in an orchestration.
 * Supports both Bearer token and X-Task-Run-JWT authentication.
 */
async function handleOrchestrationResults(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Support both Bearer token and X-Task-Run-JWT
  const authToken = parseAuthHeader(req);
  const taskRunJwt = extractTaskRunJwt(req.headers);

  if (!authToken && !taskRunJwt) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token or X-Task-Run-JWT header" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // Extract orchestration ID from path: /api/orchestrate/results/<id>
  const pathParts = url.pathname.split("/");
  const orchestrationId = pathParts[pathParts.length - 1];

  if (!orchestrationId || orchestrationId === "results") {
    jsonResponse(res, 400, { error: "Missing orchestration ID in path" });
    return;
  }

  const teamSlugOrId = url.searchParams.get("teamSlugOrId");

  try {
    // If using JWT auth, query via Convex HTTP endpoint
    if (taskRunJwt) {
      const convexSiteUrl = getConvexSiteUrl();

      const convexResponse = await fetch(
        `${convexSiteUrl}/api/orchestration/results?orchestrationId=${encodeURIComponent(orchestrationId)}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            "X-Task-Run-JWT": taskRunJwt,
          },
        }
      );

      if (!convexResponse.ok) {
        const errorMessage = await getResponseErrorMessage(convexResponse);
        jsonResponse(res, convexResponse.status, { error: errorMessage });
        return;
      }

      const results = await convexResponse.json();
      jsonResponse(res, 200, results);
      return;
    }

    // Bearer token auth path
    if (!teamSlugOrId) {
      jsonResponse(res, 400, { error: "Missing required query parameter: teamSlugOrId" });
      return;
    }

    const authHeaderJson = JSON.stringify({ accessToken: authToken });

    const result = await runWithAuth(authToken!, authHeaderJson, async () => {
      // Get all orchestration tasks for this orchestrationId (stored in metadata)
      const tasks = await getConvex().query(api.orchestrationQueries.listTasksByTeam, {
        teamSlugOrId,
        limit: 100,
      });

      const filteredTasks = tasks.filter((task) =>
        matchesOrchestrationTaskGroup(task, orchestrationId),
      );

      const totalTasks = filteredTasks.length;
      const completedTasks = filteredTasks.filter((t) => t.status === "completed").length;
      const failedTasks = filteredTasks.filter((t) => t.status === "failed").length;

      // Determine overall status
      let status: "running" | "completed" | "failed" | "partial";
      if (totalTasks === 0) {
        status = "completed";
      } else if (completedTasks === totalTasks) {
        status = "completed";
      } else if (failedTasks > 0 && completedTasks + failedTasks === totalTasks) {
        status = "failed";
      } else if (completedTasks > 0 || failedTasks > 0) {
        status = "partial";
      } else {
        status = "running";
      }

      return {
        orchestrationId,
        status,
        totalTasks,
        completedTasks,
        results: filteredTasks.map((t) => ({
          taskId: t._id,
          agentName: t.assignedAgentName,
          status: t.status,
          prompt: t.prompt,
          result: t.result,
          errorMessage: t.errorMessage,
          taskRunId: t.taskRunId,
        })),
      };
    });

    jsonResponse(res, 200, result);
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/results failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Handle GET /api/orchestrate/events/*
 *
 * Server-Sent Events stream for orchestration updates.
 * Provides real-time updates for head agents monitoring sub-agents.
 *
 * Events:
 * - task_status: Task status changed
 * - task_completed: Task completed (with result)
 * - message_received: New message in mailbox
 * - heartbeat: Keep-alive every 30 seconds
 */
async function handleOrchestrationEvents(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Support both Bearer token and X-Task-Run-JWT
  const authToken = parseAuthHeader(req);
  const taskRunJwt = extractTaskRunJwt(req.headers);

  if (!authToken && !taskRunJwt) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token or X-Task-Run-JWT header" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  // Extract orchestration ID from path: /api/orchestrate/events/<id>
  const pathParts = url.pathname.split("/");
  const orchestrationId = pathParts[pathParts.length - 1];

  if (!orchestrationId || orchestrationId === "events") {
    jsonResponse(res, 400, { error: "Missing orchestration ID in path" });
    return;
  }

  const teamSlugOrId = url.searchParams.get("teamSlugOrId");
  const lastEventId = req.headers["last-event-id"];

  // Validate auth
  if (!taskRunJwt && !teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required query parameter: teamSlugOrId" });
    return;
  }

  // Set up SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "Access-Control-Allow-Origin": "*",
    "X-Accel-Buffering": "no",
  });

  serverLogger.info("[http-api] SSE connection established", { orchestrationId });

  // Send initial connected event
  const sendEvent = (event: string, data: unknown, id?: string) => {
    if (id) {
      res.write(`id: ${id}\n`);
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  sendEvent("connected", { orchestrationId, timestamp: Date.now() });

  // Track task statuses for change detection
  const taskStatuses = new Map<string, string>();
  let eventId = parseInt(lastEventId as string, 10) || 0;
  let isConnectionClosed = false;

  // Handle client disconnect
  req.on("close", () => {
    isConnectionClosed = true;
    serverLogger.info("[http-api] SSE connection closed", { orchestrationId });
  });

  // Helper to fetch current state
  const fetchState = async () => {
    try {
      if (taskRunJwt) {
        const convexSiteUrl = getConvexSiteUrl();
        const response = await fetch(
          `${convexSiteUrl}/api/orchestration/pull?orchestrationId=${encodeURIComponent(orchestrationId)}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              "X-Task-Run-JWT": taskRunJwt,
            },
          }
        );
        if (response.ok) {
          return await response.json();
        }
        return null;
      }

      // Bearer auth path
      if (authToken && teamSlugOrId) {
        const authHeaderJson = JSON.stringify({ accessToken: authToken });
        return await runWithAuth(authToken, authHeaderJson, async () => {
          const tasks = await getConvex().query(api.orchestrationQueries.listTasksByTeam, {
            teamSlugOrId,
            limit: 100,
          });
          const filtered = tasks.filter((task) =>
            matchesOrchestrationTaskGroup(task, orchestrationId),
          );
          return {
            tasks: filtered,
            ...summarizeOrchestrationTasks(filtered),
          };
        });
      }
      return null;
    } catch (error) {
      serverLogger.error("[http-api] SSE fetch state error", error);
      return null;
    }
  };

  // Polling loop
  const pollInterval = 5000; // 5 seconds
  const heartbeatInterval = 30000; // 30 seconds
  let lastHeartbeat = Date.now();

  const poll = async () => {
    if (isConnectionClosed) return;

    try {
      const state = await fetchState();
      if (!state || isConnectionClosed) return;

      // Check for status changes
      for (const task of state.tasks) {
        const taskId = task._id || task.id;
        const prevStatus = taskStatuses.get(taskId);
        const currentStatus = task.status;

        if (prevStatus !== currentStatus) {
          eventId++;
          taskStatuses.set(taskId, currentStatus);

          if (currentStatus === "completed") {
            sendEvent("task_completed", {
              taskId,
              status: currentStatus,
              result: task.result,
              completedAt: task.completedAt || Date.now(),
            }, String(eventId));
          } else if (currentStatus === "failed") {
            sendEvent("task_status", {
              taskId,
              status: currentStatus,
              errorMessage: task.errorMessage,
            }, String(eventId));
          } else {
            sendEvent("task_status", {
              taskId,
              status: currentStatus,
              assignedAgentName: task.assignedAgentName,
            }, String(eventId));
          }
        }
      }

      // Send heartbeat if needed
      if (Date.now() - lastHeartbeat >= heartbeatInterval) {
        lastHeartbeat = Date.now();
        sendEvent("heartbeat", {
          timestamp: lastHeartbeat,
          completedCount: state.completedCount,
          pendingCount: state.pendingCount,
          failedCount: state.failedCount,
          runningCount: state.runningCount,
        });
      }
    } catch (error) {
      serverLogger.error("[http-api] SSE poll error", error);
    }

    // Schedule next poll
    if (!isConnectionClosed) {
      setTimeout(poll, pollInterval);
    }
  };

  // Start polling
  void poll();
}

/**
 * Handle POST /api/orchestrate/cancel/*
 *
 * Cancels an orchestration task and cascades to the linked taskRun.
 */
async function handleOrchestrationCancel(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const authHeaderJson = JSON.stringify({ accessToken: authToken });

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const body = await readJsonBody<{ teamSlugOrId: string }>(req);

  if (!body?.teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required field: teamSlugOrId" });
    return;
  }

  // Extract orchestration task ID from path: /api/orchestrate/cancel/<id>
  const pathParts = url.pathname.split("/");
  const orchestrationTaskId = pathParts[pathParts.length - 1];

  if (!orchestrationTaskId || orchestrationTaskId === "cancel") {
    jsonResponse(res, 400, { error: "Missing orchestration task ID in path" });
    return;
  }

  try {
    await runWithAuth(authToken, authHeaderJson, async () => {
      // Verify team membership first
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      const membership = memberships.find(
        (m) => m.team.teamId === body.teamSlugOrId || m.team.slug === body.teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      // Get the orchestration task first to find linked taskRunId
      const task = await getConvex().query(api.orchestrationQueries.getTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
        teamSlugOrId: membership.team.teamId,
      });

      if (!task) {
        throw new Error("Orchestration task not found");
      }

      // Cancel the orchestration task
      await getConvex().mutation(api.orchestrationQueries.cancelTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
      });

      // Cascade to taskRun if it exists (use team-level auth, not owner-only)
      if (task.taskRunId) {
        try {
          await getConvex().mutation(api.taskRuns.failByTeamMember, {
            teamSlugOrId: body.teamSlugOrId,
            id: task.taskRunId,
            errorMessage: "Cancelled via orchestration",
            exitCode: 130, // SIGINT exit code
          });
        } catch (taskRunError) {
          // Log but don't fail - orchestration task is already cancelled
          serverLogger.warn("[http-api] Failed to cascade cancel to taskRun", taskRunError);
        }
      }
    });

    jsonResponse(res, 200, { success: true });
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/cancel failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

interface OrchestrationMigrateRequest {
  teamSlugOrId: string;
  planJson: string;           // Raw PLAN.json content
  agentsJson?: string;        // Raw AGENTS.json content (optional)
  agent?: string;             // Override head agent (defaults to plan.headAgent)
  repo?: string;
  branch?: string;
  environmentId?: string;
}

interface OrchestrationMigrateResponse {
  orchestrationTaskId: string;
  taskId: string;
  taskRunId: string;
  agentName: string;
  orchestrationId: string;
  vscodeUrl?: string;
  status: string;
}

/**
 * Handle POST /api/orchestrate/migrate
 *
 * Migrates local orchestration state (PLAN.json) to a sandbox and spawns
 * the head agent to continue execution. This enables hybrid execution where
 * a local head agent can hand off to a sandbox for long-running operations.
 */
async function handleOrchestrationMigrate(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const authHeaderJson = JSON.stringify({ accessToken: authToken });

  const body = await readJsonBody<OrchestrationMigrateRequest>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { teamSlugOrId, planJson, agentsJson, agent, repo, branch, environmentId } = body;

  if (!teamSlugOrId || !planJson) {
    jsonResponse(res, 400, { error: "Missing required fields: teamSlugOrId, planJson" });
    return;
  }

  // Parse and validate PLAN.json
  interface PlanTask {
    id?: string;
    prompt?: string;
    status?: string;
    priority?: number;
    dependsOn?: string[];
    agentName?: string;
  }
  let plan: {
    headAgent?: string;
    orchestrationId?: string;
    description?: string;
    tasks?: PlanTask[];
  };
  try {
    plan = JSON.parse(planJson);
  } catch {
    jsonResponse(res, 400, { error: "Invalid planJson: not valid JSON" });
    return;
  }

  // Extract orchestration metadata from plan
  const headAgent = agent ?? plan.headAgent;
  if (!headAgent) {
    jsonResponse(res, 400, { error: "No headAgent specified in plan or request" });
    return;
  }

  const orchestrationId = plan.orchestrationId ?? `orch_${Date.now().toString(36)}`;
  const description = plan.description ?? "Migrated orchestration";

  serverLogger.info("[http-api] POST /api/orchestrate/migrate", {
    headAgent,
    orchestrationId,
    taskCount: plan.tasks?.length ?? 0,
  });

  try {
    const result = await runWithAuth(authToken, authHeaderJson, async () => {
      // Find the agent config
      const agentConfig = AGENT_CONFIGS.find((a) => a.name === headAgent);
      if (!agentConfig) {
        throw new Error(`Agent not found: ${headAgent}`);
      }

      // Get team info via listTeamMemberships
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      const membership = memberships.find(
        (m) => m.team.teamId === teamSlugOrId || m.team.slug === teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      // Generate head agent prompt from plan
      const taskSummary = plan.tasks?.length
        ? `You are resuming orchestration with ${plan.tasks.length} task(s).`
        : "You are resuming orchestration.";
      const headAgentPrompt = `${taskSummary}

Your orchestration state has been migrated from a local machine.
Check /root/lifecycle/memory/orchestration/PLAN.json for the current plan.
Continue executing the orchestration plan from where it was left off.

Description: ${description}
Orchestration ID: ${orchestrationId}`;

      // Create task record
      const taskResult = await getConvex().mutation(api.tasks.create, {
        teamSlugOrId,
        text: headAgentPrompt,
        projectFullName: repo ?? "",
        baseBranch: branch,
      });
      const taskId = taskResult.taskId;

      // Create task run record
      const taskRunResult = await getConvex().mutation(api.taskRuns.create, {
        teamSlugOrId,
        taskId,
        prompt: headAgentPrompt,
        agentName: headAgent,
        newBranch: "",
        environmentId: environmentId as Id<"environments"> | undefined,
      });
      const taskRunId = taskRunResult.taskRunId;

      // Create orchestration task record
      const orchestrationTaskId = await getConvex().mutation(api.orchestrationQueries.createTask, {
        teamSlugOrId,
        prompt: headAgentPrompt,
        taskId,
        taskRunId,
        priority: 5,
      });

      // Spawn the agent with orchestration options for state seeding
      const spawnResult = await spawnAgent(
        agentConfig,
        taskId,
        {
          repoUrl: repo,
          branch,
          taskDescription: headAgentPrompt,
          isCloudMode: true,
          environmentId: environmentId as Id<"environments"> | undefined,
          taskRunId,
          orchestrationOptions: {
            headAgent,
            orchestrationId,
            description,
            previousPlan: planJson,
            previousAgents: agentsJson,
          },
        },
        teamSlugOrId
      );

      // Update orchestration task with assignment
      if (spawnResult.success) {
        await getConvex().mutation(api.orchestrationQueries.assignAndStartTask, {
          taskId: orchestrationTaskId,
          agentName: headAgent,
        });
      } else {
        await getConvex().mutation(api.orchestrationQueries.failTask, {
          taskId: orchestrationTaskId,
          errorMessage: spawnResult.error ?? "Spawn failed",
        });
      }

      // Create orchestration tasks for pending tasks in PLAN.json
      // Each task needs: task record, taskRun record, orchestration task record
      const createdTaskIds: Record<string, string> = {};
      const pendingTasks = (plan.tasks ?? []).filter(
        (t) => t.status === "pending" && t.prompt
      );

      // First pass: create all tasks with task/taskRun records
      for (const planTask of pendingTasks) {
        if (!planTask.prompt) continue;

        // Determine which agent to use for this task
        const taskAgentName = planTask.agentName ?? headAgent;

        // Create task record
        const taskResult = await getConvex().mutation(api.tasks.create, {
          teamSlugOrId,
          text: planTask.prompt,
          projectFullName: repo ?? "",
          baseBranch: branch,
        });
        const subTaskId = taskResult.taskId;

        // Create taskRun record (so worker can get JWT)
        const taskRunResult = await getConvex().mutation(api.taskRuns.create, {
          teamSlugOrId,
          taskId: subTaskId,
          prompt: planTask.prompt,
          agentName: taskAgentName,
          newBranch: "",
          environmentId: environmentId as Id<"environments"> | undefined,
        });
        const subTaskRunId = taskRunResult.taskRunId;

        // Create orchestration task record linked to task/taskRun
        const newOrchTaskId = await getConvex().mutation(api.orchestrationQueries.createTask, {
          teamSlugOrId,
          prompt: planTask.prompt,
          priority: planTask.priority ?? 5,
          taskId: subTaskId,
          taskRunId: subTaskRunId,
        });

        if (planTask.id) {
          createdTaskIds[planTask.id] = String(newOrchTaskId);
        }
      }

      // Second pass: set up dependencies
      for (const planTask of pendingTasks) {
        if (!planTask.id || !planTask.dependsOn?.length) continue;
        const orchTaskId = createdTaskIds[planTask.id];
        if (!orchTaskId) continue;

        const depIds = planTask.dependsOn
          .map((depId) => createdTaskIds[depId])
          .filter((id): id is string => Boolean(id));

        if (depIds.length > 0) {
          await getConvex().mutation(api.orchestrationQueries.addDependencies, {
            taskId: orchTaskId as Id<"orchestrationTasks">,
            dependencyIds: depIds as Id<"orchestrationTasks">[],
          });
        }
      }

      serverLogger.info("[http-api] Created orchestration tasks from PLAN.json", {
        count: Object.keys(createdTaskIds).length,
      });

      return {
        orchestrationTaskId: String(orchestrationTaskId),
        taskId: String(taskId),
        taskRunId: String(taskRunId),
        agentName: headAgent,
        orchestrationId,
        vscodeUrl: spawnResult.vscodeUrl,
        status: spawnResult.success ? "running" : "failed",
      };
    });

    jsonResponse(res, 200, result satisfies OrchestrationMigrateResponse);
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/migrate failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

// ============================================================================
// Internal Worker Endpoints (for background orchestration worker)
// ============================================================================

interface InternalSpawnRequest {
  orchestrationTaskId: string;
  teamId: string;
  agentName: string;
  prompt: string;
  taskId: string;
  taskRunId: string;
  taskRunJwt?: string; // JWT for auth context (provided by worker)
  userId?: string; // User ID for auth context
}

/**
 * Handle POST /api/orchestrate/internal/spawn
 *
 * Internal endpoint for the background orchestration worker to spawn agents.
 * Protected by CMUX_INTERNAL_SECRET header validation.
 *
 * The worker provides the taskRunJwt obtained from Convex internal mutation.
 * This JWT is used to authenticate with Convex HTTP endpoints.
 */
async function handleOrchestrationInternalSpawn(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  // Validate internal secret
  const internalSecret = req.headers["x-internal-secret"];
  if (!env.CMUX_INTERNAL_SECRET || internalSecret !== env.CMUX_INTERNAL_SECRET) {
    jsonResponse(res, 401, { error: "Unauthorized: Invalid internal secret" });
    return;
  }

  const body = await readJsonBody<InternalSpawnRequest>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { orchestrationTaskId, agentName, prompt, taskId, taskRunId, taskRunJwt, teamId } = body;

  if (!orchestrationTaskId || !agentName || !prompt || !taskId || !taskRunId) {
    jsonResponse(res, 400, { error: "Missing required fields" });
    return;
  }

  if (!taskRunJwt) {
    jsonResponse(res, 400, { error: "Missing taskRunJwt - worker must provide JWT for auth" });
    return;
  }

  serverLogger.info("[http-api] POST /api/orchestrate/internal/spawn", {
    orchestrationTaskId,
    agentName,
    taskId,
    taskRunId,
    prompt: prompt?.slice(0, 100),
  });

  try {
    // Find the agent config
    const agentConfig = AGENT_CONFIGS.find((a) => a.name === agentName);
    if (!agentConfig) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // Fetch spawn config via JWT-authenticated endpoint (needed for spawnAgent)
    const convexSiteUrl = getConvexSiteUrl();
    const spawnConfigResponse = await fetch(`${convexSiteUrl}/api/orchestration/spawn-config`, {
      method: "GET",
      headers: {
        "X-Task-Run-JWT": taskRunJwt,
      },
    });

    if (!spawnConfigResponse.ok) {
      const errorMessage = await getResponseErrorMessage(spawnConfigResponse);
      throw new Error(`Failed to fetch spawn config: ${errorMessage}`);
    }

    const preFetchedConfig = await spawnConfigResponse.json() as PreFetchedSpawnConfig;

    // Spawn the agent using pre-fetched config (Stack Auth not available in worker context)
    const spawnResult = await spawnAgent(
      agentConfig,
      taskId as Id<"tasks">,
      {
        taskDescription: prompt,
        isCloudMode: true,
        taskRunId: taskRunId as Id<"taskRuns">,
        preFetchedConfig,
      },
      teamId,
      taskRunJwt
    );

    // Send response immediately — don't block on best-effort status update
    jsonResponse(res, 200, {
      success: spawnResult.success,
      taskId,
      taskRunId,
      vscodeUrl: spawnResult.vscodeUrl,
      error: spawnResult.error,
    });

    // Update orchestration task status via Convex HTTP endpoint (best-effort, non-blocking)
    updateOrchestrationTaskViaHttp(taskRunJwt, spawnResult.success
      ? { orchestrationTaskId, status: "running", agentName }
      : { orchestrationTaskId, status: "failed", errorMessage: spawnResult.error ?? "Spawn failed" }
    );
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/internal/spawn failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Orchestration Metrics Response Interface
 */
interface OrchestrationMetrics {
  activeOrchestrations: number;
  tasksByStatus: Record<string, number>;
  providerHealth: Record<string, {
    status: string;
    circuitState: string;
    latencyP50: number;
    latencyP99: number;
    successRate: number;
    failureCount: number;
  }>;
}

/**
 * Handle GET /api/orchestrate/metrics
 *
 * Returns orchestration metrics including:
 * - Active orchestration count
 * - Task count by status
 * - Provider health with circuit breaker states
 */
async function handleOrchestrationMetrics(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const teamSlugOrId = url.searchParams.get("teamSlugOrId");

  if (!teamSlugOrId) {
    jsonResponse(res, 400, { error: "Missing required query parameter: teamSlugOrId" });
    return;
  }

  try {
    const metrics = await runWithAuthToken(authToken, async () => {
      // Verify team membership first
      const memberships = await getConvex().query(api.teams.listTeamMemberships, {});
      const membership = memberships.find(
        (m) => m.team.teamId === teamSlugOrId || m.team.slug === teamSlugOrId
      );
      if (!membership) {
        throw new Error("Team not found or not a member");
      }

      // Get orchestration task counts in a single Convex query instead of 6 sequential ones
      const { tasksByStatus, activeOrchestrations } = await getConvex().query(
        api.orchestrationQueries.getTaskStatusCounts,
        { teamSlugOrId: membership.team.teamId }
      );

      // Get provider health metrics
      const healthMonitor = getProviderHealthMonitor();
      const allProviderMetrics = healthMonitor.getAllMetrics();

      const providerHealth: OrchestrationMetrics["providerHealth"] = {};
      for (const metrics of allProviderMetrics) {
        providerHealth[metrics.providerId] = {
          status: metrics.status,
          circuitState: metrics.circuitState,
          latencyP50: metrics.latencyP50,
          latencyP99: metrics.latencyP99,
          successRate: metrics.successRate,
          failureCount: metrics.failureCount,
        };
      }

      // If no providers tracked yet, add common ones with default healthy state
      const commonProviders = ["claude", "openai", "gemini", "anthropic", "opencode"];
      for (const provider of commonProviders) {
        if (!providerHealth[provider]) {
          providerHealth[provider] = {
            status: "healthy",
            circuitState: "closed",
            latencyP50: 0,
            latencyP99: 0,
            successRate: 1.0,
            failureCount: 0,
          };
        }
      }

      return {
        activeOrchestrations,
        tasksByStatus,
        providerHealth,
      } satisfies OrchestrationMetrics;
    });

    jsonResponse(res, 200, metrics);
  } catch (error) {
    serverLogger.error("[http-api] orchestrate/metrics failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * Handle GET /api/providers
 *
 * Returns provider availability based on Convex-stored API keys.
 * Aggregated by vendor so the CLI can display per-provider status.
 */
async function handleGetProviders(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const teamSlugOrId = url.searchParams.get("teamSlugOrId");
  if (!teamSlugOrId) {
    jsonResponse(res, 400, {
      error: "Missing required query parameter: teamSlugOrId",
    });
    return;
  }

  try {
    const result = await runWithAuthToken(authToken, async () => {
      return await checkAllProvidersStatusWebMode({ teamSlugOrId });
    });

    const providers = aggregateByVendor(result.providers);
    jsonResponse(res, 200, { success: true, providers });
  } catch (error) {
    serverLogger.error("[http-api] GET /api/providers failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
  }
}

/**
 * HTTP request handler for apps/server
 *
 * Integrates with the existing HTTP server to add API endpoints.
 */
export function handleHttpRequest(
  req: IncomingMessage,
  res: ServerResponse
): boolean {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const path = url.pathname;
  const method = req.method;

  // CORS headers for CLI access
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Task-Run-JWT, Last-Event-ID");

  // Handle preflight
  if (method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return true;
  }

  // Route: POST /api/start-task
  if (method === "POST" && path === "/api/start-task") {
    void handleStartTask(req, res);
    return true;
  }

  // Route: POST /api/create-cloud-workspace
  if (method === "POST" && path === "/api/create-cloud-workspace") {
    void handleCreateCloudWorkspace(req, res);
    return true;
  }

  // Route: GET /api/health
  if (method === "GET" && path === "/api/health") {
    jsonResponse(res, 200, { status: "ok", service: "apps-server" });
    return true;
  }

  // Route: GET /api/providers - Get provider status (authenticated)
  if (method === "GET" && path === "/api/providers") {
    void handleGetProviders(req, res);
    return true;
  }

  // Route: GET /api/agents - List available agents
  if (method === "GET" && path === "/api/agents") {
    const agents = AGENT_CONFIGS.filter((config) => !config.disabled).map(
      (config) => ({
        name: config.name,
        command: config.command,
      })
    );
    jsonResponse(res, 200, { agents });
    return true;
  }

  // Route: POST /api/orchestrate/spawn - Spawn an agent with orchestration tracking
  if (method === "POST" && path === "/api/orchestrate/spawn") {
    void handleOrchestrationSpawn(req, res);
    return true;
  }

  // Route: GET /api/orchestrate/list - List orchestration tasks for team
  if (method === "GET" && path === "/api/orchestrate/list") {
    void handleOrchestrationList(req, res);
    return true;
  }

  // Route: GET /api/orchestrate/metrics - Get orchestration metrics and provider health
  if (method === "GET" && path === "/api/orchestrate/metrics") {
    void handleOrchestrationMetrics(req, res);
    return true;
  }

  // Route: GET /api/orchestrate/status/* - Get orchestration task status
  if (method === "GET" && path.startsWith("/api/orchestrate/status/")) {
    void handleOrchestrationStatus(req, res);
    return true;
  }

  // Route: GET /api/orchestrate/results/* - Get aggregated results from sub-agents
  if (method === "GET" && path.startsWith("/api/orchestrate/results/")) {
    void handleOrchestrationResults(req, res);
    return true;
  }

  // Route: GET /api/orchestrate/events/* - SSE stream for real-time orchestration updates
  if (method === "GET" && path.startsWith("/api/orchestrate/events/")) {
    void handleOrchestrationEvents(req, res);
    return true;
  }

  // Route: POST /api/orchestrate/cancel/* - Cancel an orchestration task
  if (method === "POST" && path.startsWith("/api/orchestrate/cancel/")) {
    void handleOrchestrationCancel(req, res);
    return true;
  }

  // Route: POST /api/orchestrate/migrate - Migrate orchestration state to sandbox
  if (method === "POST" && path === "/api/orchestrate/migrate") {
    void handleOrchestrationMigrate(req, res);
    return true;
  }

  // Route: POST /api/orchestrate/internal/spawn - Internal worker spawn endpoint
  if (method === "POST" && path === "/api/orchestrate/internal/spawn") {
    void handleOrchestrationInternalSpawn(req, res);
    return true;
  }

  // Route: GET /api/models - List models with optional credential-based filtering
  // Query params:
  //   - teamSlugOrId: Team identifier for credential-based filtering
  //   - all: If "true", returns all models ignoring credentials
  //   - vendor: Filter by vendor (e.g., "claude", "opencode")
  // When teamSlugOrId is provided with valid auth, uses listAvailable query
  // Otherwise falls back to public list (all enabled models)
  if (method === "GET" && path === "/api/models") {
    void (async () => {
      const teamSlugOrId = url.searchParams.get("teamSlugOrId");
      const showAll = url.searchParams.get("all") === "true";
      const vendorFilter = url.searchParams.get("vendor");
      const authToken = parseAuthHeader(req);

      try {
        let convexModels: Array<{
          name: string;
          displayName: string;
          vendor: string;
          requiredApiKeys: string[];
          tier: string;
          disabled?: boolean;
          disabledReason?: string;
          tags?: string[];
          variants?: Array<{ id: string; displayName: string; description?: string }>;
          defaultVariant?: string;
          source: string;
        }> | null = null; // null = not attempted, [] = attempted but empty

        // If authenticated with team, use credential-filtered query from Convex
        if (authToken && teamSlugOrId) {
          try {
            convexModels = await runWithAuthToken(authToken, async () => {
              return getConvex().query(api.models.listAvailable, {
                teamSlugOrId,
                showAll,
              });
            });
          } catch (authError) {
            serverLogger.warn("[http-api] GET /api/models auth failed, using static fallback", authError);
            // Fall through to static catalog below (convexModels stays null)
          }
        }
        // Unauthenticated or auth failed: use static catalog (when convexModels is null)

        if (convexModels !== null) {
          // Apply vendor filter if provided
          let filteredModels = convexModels;
          if (vendorFilter) {
            filteredModels = convexModels.filter((m) => m.vendor === vendorFilter);
          }

          // Use Convex models
          const models = filteredModels.map((entry) => ({
            name: entry.name,
            displayName: entry.displayName,
            vendor: entry.vendor,
            requiredApiKeys: entry.requiredApiKeys,
            tier: entry.tier,
            disabled: entry.disabled ?? false,
            disabledReason: entry.disabledReason ?? null,
            tags: entry.tags ?? [],
            variants: entry.variants ?? getVariantsForVendor(entry.vendor as Parameters<typeof getVariantsForVendor>[0]),
            defaultVariant: entry.defaultVariant ?? "default",
            source: entry.source,
          }));
          jsonResponse(res, 200, {
            models,
            source: "convex",
            filtered: !!teamSlugOrId && !!authToken && !showAll,
          });
        } else {
          // Fallback to static catalog
          let staticModels = AGENT_CATALOG;
          if (vendorFilter) {
            staticModels = AGENT_CATALOG.filter((m) => m.vendor === vendorFilter);
          }

          const models = staticModels.map((entry) => ({
            name: entry.name,
            displayName: entry.displayName,
            vendor: entry.vendor,
            requiredApiKeys: entry.requiredApiKeys,
            tier: entry.tier,
            disabled: entry.disabled ?? false,
            disabledReason: entry.disabledReason ?? null,
            tags: entry.tags ?? [],
            variants: entry.variants ?? getVariantsForVendor(entry.vendor),
            defaultVariant: entry.defaultVariant ?? "default",
            source: "curated",
          }));
          jsonResponse(res, 200, { models, source: "static", filtered: false });
        }
      } catch (error) {
        serverLogger.error("[http-api] GET /api/models failed, using static fallback", error);
        // Fallback to static catalog on error
        let staticModels = AGENT_CATALOG;
        if (vendorFilter) {
          staticModels = AGENT_CATALOG.filter((m) => m.vendor === vendorFilter);
        }

        const models = staticModels.map((entry) => ({
          name: entry.name,
          displayName: entry.displayName,
          vendor: entry.vendor,
          requiredApiKeys: entry.requiredApiKeys,
          tier: entry.tier,
          disabled: entry.disabled ?? false,
          disabledReason: entry.disabledReason ?? null,
          tags: entry.tags ?? [],
          variants: entry.variants ?? getVariantsForVendor(entry.vendor),
          defaultVariant: entry.defaultVariant ?? "default",
          source: "curated",
        }));
        jsonResponse(res, 200, { models, source: "static", filtered: false });
      }
    })();
    return true;
  }

  // Not handled by HTTP API
  return false;
}
