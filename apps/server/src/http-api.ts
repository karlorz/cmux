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
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import { spawnAgent, spawnAllAgents } from "./agentSpawner";
import {
  DEFAULT_BRANCH_PREFIX,
  generateBranchNamesFromDescription,
  generatePRInfoAndBranchNames,
} from "./utils/branchNameGenerator";
import { getConvex } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";
import {
  aggregateByVendor,
  checkAllProvidersStatusWebMode,
} from "./utils/providerStatus";
import { runWithAuth, runWithAuthToken } from "./utils/requestContext";
import { env } from "./utils/server-env";

interface StartTaskRequest {
  // Required fields
  taskId: string;
  taskDescription: string;
  projectFullName: string;
  // Optional fields
  repoUrl?: string;
  branch?: string;
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
}

interface StartTaskResponse {
  taskId: string;
  results: Array<{
    agentName: string;
    taskRunId: string;
    vscodeUrl?: string;
    success: boolean;
    error?: string;
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
    taskRunIds,
    selectedAgents,
    isCloudMode = true, // Default to cloud mode for CLI
    environmentId,
    theme,
    teamSlugOrId,
    prTitle,
    images,
  } = body;

  if (!taskId || !taskDescription || !projectFullName) {
    jsonResponse(res, 400, {
      error: "Missing required fields: taskId, taskDescription, projectFullName",
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
    // Run with auth context (both token and authHeaderJson needed for www API calls)
    const results = await runWithAuth(authToken, authHeaderJson, async () => {
      // Determine which agents to spawn
      // Default to claude/opus-4.5 if no agent specified (matches CLI default)
      const agentsToSpawn = selectedAgents || ["claude/opus-4.5"];
      const agentCount = agentsToSpawn.length;

      // Fetch workspace settings for branchPrefix (same as socket.io handler)
      const workspaceSettings = await getConvex().query(
        api.workspaceSettings.get,
        { teamSlugOrId }
      );
      // Use configured prefix, or default if not set (undefined/null)
      // Empty string is valid and means no prefix
      const branchPrefix =
        workspaceSettings?.branchPrefix !== undefined
          ? workspaceSettings.branchPrefix
          : DEFAULT_BRANCH_PREFIX;

      // Generate branch names for agents
      let branchNames: string[] | undefined;
      if (agentsToSpawn.length > 0) {
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
      // Mirrors the socket.io "start-task" handler behavior.
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

      // Spawn all agents using the same code path as socket.io handler
      const agentResults = await spawnAllAgents(
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
        },
        teamSlugOrId
      );

      return agentResults.map((result) => ({
        agentName: result.agentName,
        taskRunId: result.taskRunId,
        vscodeUrl: result.vscodeUrl,
        success: result.success,
        error: result.error,
      }));
    });

    serverLogger.info("[http-api] start-task completed", {
      taskId,
      resultCount: results.length,
    });

    jsonResponse(res, 200, {
      taskId,
      results,
    } satisfies StartTaskResponse);
  } catch (error) {
    serverLogger.error("[http-api] start-task failed", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    jsonResponse(res, 500, { error: message });
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
}

interface OrchestrationSpawnResponse {
  orchestrationTaskId: string;
  taskId: string;
  taskRunId: string;
  agentName: string;
  vscodeUrl?: string;
  status: string;
}

/**
 * Handle POST /api/orchestrate/spawn
 *
 * Creates orchestration tracking records and spawns an agent.
 * This creates a tasks record, taskRuns record, and orchestrationTasks record,
 * then uses spawnAgent() to start the agent.
 */
async function handleOrchestrationSpawn(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const authToken = parseAuthHeader(req);
  if (!authToken) {
    jsonResponse(res, 401, { error: "Unauthorized: Missing Bearer token" });
    return;
  }

  const authHeaderJson = JSON.stringify({ accessToken: authToken });

  const body = await readJsonBody<OrchestrationSpawnRequest>(req);
  if (!body) {
    jsonResponse(res, 400, { error: "Invalid JSON body" });
    return;
  }

  const { teamSlugOrId, prompt, agent, repo, branch, prTitle: _prTitle, environmentId, isCloudMode = true, dependsOn, priority } = body;

  if (!teamSlugOrId || !prompt || !agent) {
    jsonResponse(res, 400, { error: "Missing required fields: teamSlugOrId, prompt, agent" });
    return;
  }

  serverLogger.info("[http-api] POST /api/orchestrate/spawn", { agent, prompt: prompt.slice(0, 100) });

  try {
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
      const teamId = membership.team.teamId;
      const userId = membership.userId;

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
        teamId,
        userId,
        prompt,
        taskId,
        taskRunId,
        priority: priority ?? 5,
        dependencies: dependencyIds,
      });

      // Spawn the agent using existing infrastructure
      const spawnResult = await spawnAgent(
        agentConfig,
        taskId,
        {
          repoUrl: repo,
          branch,
          taskDescription: prompt,
          isCloudMode,
          environmentId: environmentId as Id<"environments"> | undefined,
          taskRunId,
        },
        teamSlugOrId
      );

      // Update orchestration task with assignment
      if (spawnResult.success) {
        await getConvex().mutation(api.orchestrationQueries.assignTask, {
          taskId: orchestrationTaskId,
          agentName: agent,
        });
        await getConvex().mutation(api.orchestrationQueries.startTask, {
          taskId: orchestrationTaskId,
        });
      } else {
        await getConvex().mutation(api.orchestrationQueries.failTask, {
          taskId: orchestrationTaskId,
          errorMessage: spawnResult.error ?? "Spawn failed",
        });
      }

      return {
        orchestrationTaskId: String(orchestrationTaskId),
        taskId: String(taskId),
        taskRunId: String(taskRunId),
        agentName: agent,
        vscodeUrl: spawnResult.vscodeUrl,
        status: spawnResult.success ? "running" : "failed",
      };
    });

    jsonResponse(res, 200, result satisfies OrchestrationSpawnResponse);
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
  const status = url.searchParams.get("status") as
    | "pending"
    | "assigned"
    | "running"
    | "completed"
    | "failed"
    | "cancelled"
    | null;

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

      const tasks = await getConvex().query(api.orchestrationQueries.listTasksByTeam, {
        teamId: membership.team.teamId,
        status: status ?? undefined,
        limit: 50,
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
      const task = await getConvex().query(api.orchestrationQueries.getTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
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
      // Get the orchestration task first to find linked taskRunId
      const task = await getConvex().query(api.orchestrationQueries.getTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
      });

      if (!task) {
        throw new Error("Orchestration task not found");
      }

      // Cancel the orchestration task
      await getConvex().mutation(api.orchestrationQueries.cancelTask, {
        taskId: orchestrationTaskId as Id<"orchestrationTasks">,
      });

      // Cascade to taskRun if it exists
      if (task.taskRunId) {
        try {
          await getConvex().mutation(api.taskRuns.fail, {
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
      const teamId = membership.team.teamId;
      const userId = membership.userId;

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
        teamId,
        userId,
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
        await getConvex().mutation(api.orchestrationQueries.assignTask, {
          taskId: orchestrationTaskId,
          agentName: headAgent,
        });
        await getConvex().mutation(api.orchestrationQueries.startTask, {
          taskId: orchestrationTaskId,
        });
      } else {
        await getConvex().mutation(api.orchestrationQueries.failTask, {
          taskId: orchestrationTaskId,
          errorMessage: spawnResult.error ?? "Spawn failed",
        });
      }

      // Create orchestration tasks for pending tasks in PLAN.json
      const createdTaskIds: Record<string, string> = {};
      const pendingTasks = (plan.tasks ?? []).filter(
        (t) => t.status === "pending" && t.prompt
      );

      // First pass: create all tasks
      for (const planTask of pendingTasks) {
        if (!planTask.prompt) continue;
        const newTaskId = await getConvex().mutation(api.orchestrationQueries.createTask, {
          teamId,
          userId,
          prompt: planTask.prompt,
          priority: planTask.priority ?? 5,
        });
        if (planTask.id) {
          createdTaskIds[planTask.id] = String(newTaskId);
        }
      }

      // Second pass: set up dependencies
      for (const planTask of pendingTasks) {
        if (!planTask.id || !planTask.dependsOn?.length) continue;
        const taskId = createdTaskIds[planTask.id];
        if (!taskId) continue;

        const depIds = planTask.dependsOn
          .map((depId) => createdTaskIds[depId])
          .filter((id): id is string => Boolean(id));

        if (depIds.length > 0) {
          await getConvex().mutation(api.orchestrationQueries.addDependencies, {
            taskId: taskId as Id<"orchestrationTasks">,
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
}

/**
 * Handle POST /api/orchestrate/internal/spawn
 *
 * Internal endpoint for the background orchestration worker to spawn agents.
 * Protected by CMUX_INTERNAL_SECRET header validation.
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

  const { orchestrationTaskId, teamId, agentName, prompt, taskId, taskRunId } = body;

  if (!orchestrationTaskId || !teamId || !agentName || !prompt || !taskId || !taskRunId) {
    jsonResponse(res, 400, {
      error: "Missing required fields: orchestrationTaskId, teamId, agentName, prompt, taskId, taskRunId",
    });
    return;
  }

  serverLogger.info("[http-api] POST /api/orchestrate/internal/spawn", {
    orchestrationTaskId,
    agentName,
    prompt: prompt.slice(0, 100),
  });

  try {
    // Find the agent config
    const agentConfig = AGENT_CONFIGS.find((a) => a.name === agentName);
    if (!agentConfig) {
      throw new Error(`Agent not found: ${agentName}`);
    }

    // Use the existing taskId and taskRunId from the orchestration task
    const effectiveTaskId = taskId as Id<"tasks">;
    const effectiveTaskRunId = taskRunId as Id<"taskRuns">;

    // Spawn the agent using existing infrastructure
    // Note: This runs without user auth context since it's an internal worker call
    const spawnResult = await spawnAgent(
      agentConfig,
      effectiveTaskId,
      {
        taskDescription: prompt,
        isCloudMode: true,
        taskRunId: effectiveTaskRunId,
      },
      teamId
    );

    jsonResponse(res, 200, {
      success: spawnResult.success,
      taskId: String(effectiveTaskId),
      taskRunId: spawnResult.taskRunId,
      vscodeUrl: spawnResult.vscodeUrl,
      error: spawnResult.error,
    });
  } catch (error) {
    serverLogger.error("[http-api] internal spawn failed", error);
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
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

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

  // Route: GET /api/orchestrate/status/* - Get orchestration task status
  if (method === "GET" && path.startsWith("/api/orchestrate/status/")) {
    void handleOrchestrationStatus(req, res);
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
