/**
 * HTTP Actions for Orchestration with JWT Authentication
 *
 * These endpoints allow agents to spawn sub-agents using their task-run JWT
 * instead of requiring Stack Auth Bearer tokens.
 */

import { verifyTaskRunToken } from "../../shared/src/convex-safe";
import { env } from "../_shared/convex-env";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { z } from "zod";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function extractBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }
  const token = match[1]?.trim();
  return token && token.length > 0 ? token : null;
}

const CreateTaskAndRunSchema = z.object({
  text: z.string().min(1),
  projectFullName: z.string().optional(),
  baseBranch: z.string().optional(),
  prompt: z.string().min(1),
  agentName: z.string().optional(),
  newBranch: z.string().optional(),
  environmentId: z.string().optional(),
});

type CreateTaskAndRunInput = z.infer<typeof CreateTaskAndRunSchema>;

/**
 * HTTP action to create a task and task run in one call.
 *
 * Authenticates via task-run JWT (X-Task-Run-JWT header).
 * Used by agents to spawn sub-agents.
 *
 * Returns: { taskId, taskRunId, jwt }
 */
export const createTaskAndRun = httpAction(async (ctx, req) => {
  // Support both X-Task-Run-JWT header and Bearer token with task-run JWT
  const taskRunJwt = req.headers.get("x-task-run-jwt");
  const authHeader = req.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const token = taskRunJwt ?? bearerToken;

  if (!token) {
    console.warn("[orchestration_http] Missing JWT token");
    return jsonResponse(
      {
        code: 401,
        message: "Unauthorized: Missing X-Task-Run-JWT header or Bearer token",
      },
      401
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }

  let payload: CreateTaskAndRunInput;
  try {
    const parsed = await req.json();
    const validation = CreateTaskAndRunSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn(
        "[orchestration_http] Invalid payload",
        validation.error.flatten()
      );
      return jsonResponse({ code: 400, message: "Invalid payload" }, 400);
    }
    payload = validation.data;
  } catch (error) {
    console.error("[orchestration_http] Failed to parse payload", error);
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  // Verify the JWT
  let teamId: string;
  let userId: string;

  try {
    const tokenPayload = await verifyTaskRunToken(
      token,
      env.CMUX_TASK_RUN_JWT_SECRET
    );
    teamId = tokenPayload.teamId;
    userId = tokenPayload.userId;
  } catch (error) {
    console.error("[orchestration_http] Failed to verify JWT", error);
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  try {
    // Create task
    const taskResult = await ctx.runMutation(internal.tasks.createInternal, {
      teamId,
      userId,
      text: payload.text,
      projectFullName: payload.projectFullName ?? "",
      baseBranch: payload.baseBranch,
    });

    // Create task run
    const taskRunResult = await ctx.runMutation(
      internal.taskRuns.createInternal,
      {
        teamId,
        userId,
        taskId: taskResult.taskId,
        prompt: payload.prompt,
        agentName: payload.agentName,
        newBranch: payload.newBranch,
        environmentId: payload.environmentId as Id<"environments"> | undefined,
      }
    );

    return jsonResponse({
      taskId: taskResult.taskId,
      taskRunId: taskRunResult.taskRunId,
      jwt: taskRunResult.jwt,
    });
  } catch (error) {
    console.error("[orchestration_http] Failed to create task/run", error);
    return jsonResponse(
      { code: 500, message: "Failed to create task and run" },
      500
    );
  }
});

const CreateOrchestrationTaskSchema = z.object({
  prompt: z.string().min(1),
  taskId: z.string().min(1),
  taskRunId: z.string().min(1),
  priority: z.number().optional(),
  dependencies: z.array(z.string()).optional(),
});

type CreateOrchestrationTaskInput = z.infer<
  typeof CreateOrchestrationTaskSchema
>;

/**
 * HTTP action to create an orchestration task.
 *
 * Authenticates via task-run JWT.
 * Used by agents to track their spawned sub-tasks.
 */
export const createOrchestrationTask = httpAction(async (ctx, req) => {
  const taskRunJwt = req.headers.get("x-task-run-jwt");
  const authHeader = req.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const token = taskRunJwt ?? bearerToken;

  if (!token) {
    return jsonResponse(
      {
        code: 401,
        message: "Unauthorized: Missing X-Task-Run-JWT header or Bearer token",
      },
      401
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }

  let payload: CreateOrchestrationTaskInput;
  try {
    const parsed = await req.json();
    const validation = CreateOrchestrationTaskSchema.safeParse(parsed);
    if (!validation.success) {
      return jsonResponse({ code: 400, message: "Invalid payload" }, 400);
    }
    payload = validation.data;
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  let teamId: string;
  let userId: string;

  try {
    const tokenPayload = await verifyTaskRunToken(
      token,
      env.CMUX_TASK_RUN_JWT_SECRET
    );
    teamId = tokenPayload.teamId;
    userId = tokenPayload.userId;
  } catch {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  try {
    const orchestrationTaskId = await ctx.runMutation(
      internal.orchestrationQueries.createTaskInternal,
      {
        teamId,
        userId,
        prompt: payload.prompt,
        taskId: payload.taskId as Id<"tasks">,
        taskRunId: payload.taskRunId as Id<"taskRuns">,
        priority: payload.priority ?? 5,
        dependencies: payload.dependencies?.map(
          (id) => id as Id<"orchestrationTasks">
        ),
      }
    );

    return jsonResponse({ orchestrationTaskId });
  } catch (error) {
    console.error(
      "[orchestration_http] Failed to create orchestration task",
      error
    );
    return jsonResponse({ code: 500, message: "Failed to create task" }, 500);
  }
});

const UpdateOrchestrationTaskSchema = z.object({
  orchestrationTaskId: z.string().min(1),
  status: z
    .enum(["assigned", "running", "completed", "failed", "cancelled"])
    .optional(),
  agentName: z.string().optional(),
  sandboxId: z.string().optional(),
  errorMessage: z.string().optional(),
  result: z.string().optional(),
});

type UpdateOrchestrationTaskInput = z.infer<
  typeof UpdateOrchestrationTaskSchema
>;

/**
 * HTTP action to update an orchestration task status.
 *
 * Authenticates via task-run JWT.
 */
export const updateOrchestrationTask = httpAction(async (ctx, req) => {
  const taskRunJwt = req.headers.get("x-task-run-jwt");
  const authHeader = req.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const token = taskRunJwt ?? bearerToken;

  if (!token) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }

  let payload: UpdateOrchestrationTaskInput;
  try {
    const parsed = await req.json();
    const validation = UpdateOrchestrationTaskSchema.safeParse(parsed);
    if (!validation.success) {
      return jsonResponse({ code: 400, message: "Invalid payload" }, 400);
    }
    payload = validation.data;
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  // Verify JWT (we just need to confirm it's valid, teamId/userId not strictly needed here)
  try {
    await verifyTaskRunToken(token, env.CMUX_TASK_RUN_JWT_SECRET);
  } catch {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const orchestrationTaskId = payload.orchestrationTaskId as Id<
    "orchestrationTasks"
  >;

  try {
    // Handle different status updates
    if (payload.status === "assigned" && payload.agentName) {
      await ctx.runMutation(internal.orchestrationQueries.assignTaskInternal, {
        taskId: orchestrationTaskId,
        agentName: payload.agentName,
        sandboxId: payload.sandboxId,
      });
    } else if (payload.status === "running") {
      await ctx.runMutation(internal.orchestrationQueries.startTaskInternal, {
        taskId: orchestrationTaskId,
      });
    } else if (payload.status === "failed" && payload.errorMessage) {
      await ctx.runMutation(internal.orchestrationQueries.failTaskInternal, {
        taskId: orchestrationTaskId,
        errorMessage: payload.errorMessage,
      });
    } else if (payload.status === "completed") {
      // Note: completeTask is an authMutation, need to add internal version
      await ctx.runMutation(internal.orchestrationQueries.completeTaskInternal, {
        taskId: orchestrationTaskId,
        result: payload.result,
      });
    }

    return jsonResponse({ ok: true });
  } catch (error) {
    console.error(
      "[orchestration_http] Failed to update orchestration task",
      error
    );
    return jsonResponse({ code: 500, message: "Failed to update task" }, 500);
  }
});
