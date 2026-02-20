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
import type { Id } from "@cmux/convex/dataModel";
import { spawnAllAgents } from "./agentSpawner";
import { generateBranchNamesFromDescription } from "./utils/branchNameGenerator";
import { serverLogger } from "./utils/fileLogger";
import { runWithAuthToken } from "./utils/requestContext";

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
    // Run with auth context from token
    const results = await runWithAuthToken(authToken, async () => {
      // Determine which agents to spawn
      const agentsToSpawn = selectedAgents || ["claude-code"];

      // Generate branch names for agents
      let branchNames: string[] | undefined;
      if (agentsToSpawn.length > 0) {
        branchNames = generateBranchNamesFromDescription(
          taskDescription,
          agentsToSpawn.length,
          teamSlugOrId
        );
      }

      // Spawn all agents using the same code path as socket.io handler
      const agentResults = await spawnAllAgents(
        taskId as Id<"tasks">,
        {
          repoUrl,
          branch,
          taskDescription,
          branchNames,
          selectedAgents: agentsToSpawn,
          taskRunIds: taskRunIds as Id<"taskRuns">[] | undefined,
          isCloudMode,
          environmentId: environmentId as Id<"environments"> | undefined,
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

  // Not handled by HTTP API
  return false;
}
