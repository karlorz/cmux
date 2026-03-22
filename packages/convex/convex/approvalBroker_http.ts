/**
 * HTTP Actions for Approval Broker with JWT Authentication
 *
 * These endpoints allow sandbox permission hooks to communicate with Convex
 * using their task-run JWT for authentication.
 *
 * Endpoints:
 * - POST /api/approvals/create - Create approval request
 * - GET /api/approvals/:requestId - Get approval status (poll)
 * - POST /api/approvals/:requestId/resolve - Resolve approval (internal)
 */

import { verifyTaskRunToken } from "../../shared/src/convex-safe";
import { env } from "../_shared/convex-env";
import { jsonResponse, extractBearerToken } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { z } from "zod";

/**
 * Verify JWT from Authorization header, returning taskRunId or an error Response.
 */
async function authenticateRequest(
  req: Request
): Promise<{ taskRunId: string } | Response> {
  const authHeader = req.headers.get("authorization");
  const token = extractBearerToken(authHeader);
  if (!token) {
    return jsonResponse({ code: 401, message: "Missing authorization token" }, 401);
  }

  try {
    const tokenPayload = await verifyTaskRunToken(
      token,
      env.CMUX_TASK_RUN_JWT_SECRET
    );
    return { taskRunId: tokenPayload.taskRunId };
  } catch (error) {
    console.error("[approvalBroker_http] Failed to verify JWT", error);
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }
}

/**
 * Verify Content-Type is application/json. Returns error Response or null.
 */
function requireJsonContentType(req: Request): Response | null {
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }
  return null;
}

/**
 * POST /api/approvals/create
 *
 * Create a new approval request from a sandbox permission hook.
 * Returns the requestId for polling.
 */
export const createApproval = httpAction(async (ctx, req) => {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  const authResult = await authenticateRequest(req);
  if (authResult instanceof Response) return authResult;
  const { taskRunId } = authResult;

  // Parse and validate body
  const CreateApprovalSchema = z.object({
    source: z.enum(["tool_use", "head_agent", "worker_agent", "policy", "system"]),
    approvalType: z.enum([
      "tool_permission",
      "review_request",
      "deployment",
      "cost_override",
      "escalation",
      "risky_action",
    ]),
    action: z.string().min(1),
    context: z.object({
      agentName: z.string(),
      filePath: z.string().optional(),
      command: z.string().optional(),
      reasoning: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
    }),
    payload: z.any().optional(),
    expiresInMs: z.number().optional(),
  });

  let payload: z.infer<typeof CreateApprovalSchema>;
  try {
    const parsed = await req.json();
    const validation = CreateApprovalSchema.safeParse(parsed);
    if (!validation.success) {
      return jsonResponse(
        { code: 400, message: `Invalid payload: ${validation.error.message}` },
        400
      );
    }
    payload = validation.data;
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  try {
    // Get task run to find teamId and orchestrationId
    const taskRun = await ctx.runQuery(internal.taskRuns.getById, {
      id: taskRunId as Id<"taskRuns">,
    });

    if (!taskRun) {
      return jsonResponse({ code: 404, message: "Task run not found" }, 404);
    }

    const teamId = taskRun.teamId;
    const orchestrationId = taskRun.orchestrationId ?? taskRunId;

    const result = await ctx.runMutation(internal.approvalBroker.createRequestInternal, {
      teamId,
      orchestrationId,
      taskRunId: taskRunId as Id<"taskRuns">,
      source: payload.source,
      approvalType: payload.approvalType,
      action: payload.action,
      context: payload.context,
      payload: payload.payload,
      expiresInMs: payload.expiresInMs ?? 300000, // Default 5 minutes
    });

    return jsonResponse({
      ok: true,
      requestId: result.requestId,
    });
  } catch (error) {
    console.error("[approvalBroker_http] Failed to create approval", error);
    const message = error instanceof Error ? error.message : "Failed to create approval";
    return jsonResponse({ code: 500, message }, 500);
  }
});

/**
 * GET /api/approvals/:requestId
 *
 * Get the status of an approval request.
 * Used by permission hooks to poll for resolution.
 */
export const getApproval = httpAction(async (ctx, req) => {
  const authResult = await authenticateRequest(req);
  if (authResult instanceof Response) return authResult;
  const { taskRunId } = authResult;

  // Extract requestId from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  const requestId = pathParts[pathParts.length - 1];

  if (!requestId || !requestId.startsWith("apr_")) {
    return jsonResponse({ code: 400, message: "Invalid request ID" }, 400);
  }

  try {
    // Get task run to find teamId
    const taskRun = await ctx.runQuery(internal.taskRuns.getById, {
      id: taskRunId as Id<"taskRuns">,
    });

    if (!taskRun) {
      return jsonResponse({ code: 404, message: "Task run not found" }, 404);
    }

    const request = await ctx.runQuery(internal.approvalBroker.getByRequestIdInternal, {
      requestId,
    });

    if (!request) {
      return jsonResponse({ code: 404, message: "Approval request not found" }, 404);
    }

    if (request.teamId !== taskRun.teamId) {
      return jsonResponse({ code: 403, message: "Forbidden" }, 403);
    }

    // Return status in format expected by permission hook
    return jsonResponse({
      ok: true,
      requestId: request.requestId,
      status: request.status,
      resolution: request.resolution,
      resolvedAt: request.resolvedAt,
      resolutionNote: request.resolutionNote,
    });
  } catch (error) {
    console.error("[approvalBroker_http] Failed to get approval", error);
    const message = error instanceof Error ? error.message : "Failed to get approval";
    return jsonResponse({ code: 500, message }, 500);
  }
});

/**
 * POST /api/approvals/:requestId/resolve
 *
 * Resolve an approval request programmatically.
 * Used by automated systems or head agents.
 */
export const resolveApproval = httpAction(async (ctx, req) => {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  const authResult = await authenticateRequest(req);
  if (authResult instanceof Response) return authResult;
  const { taskRunId } = authResult;

  // Extract requestId from URL path
  const url = new URL(req.url);
  const pathParts = url.pathname.split("/");
  // Path: /api/approvals/:requestId/resolve
  const requestId = pathParts[pathParts.length - 2];

  if (!requestId || !requestId.startsWith("apr_")) {
    return jsonResponse({ code: 400, message: "Invalid request ID" }, 400);
  }

  // Parse and validate body
  const ResolveSchema = z.object({
    resolution: z.enum(["allow", "allow_once", "allow_session", "deny", "deny_always"]),
    note: z.string().optional(),
  });

  let payload: z.infer<typeof ResolveSchema>;
  try {
    const parsed = await req.json();
    const validation = ResolveSchema.safeParse(parsed);
    if (!validation.success) {
      return jsonResponse(
        { code: 400, message: `Invalid payload: ${validation.error.message}` },
        400
      );
    }
    payload = validation.data;
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON" }, 400);
  }

  try {
    // Get task run to find teamId
    const taskRun = await ctx.runQuery(internal.taskRuns.getById, {
      id: taskRunId as Id<"taskRuns">,
    });

    if (!taskRun) {
      return jsonResponse({ code: 404, message: "Task run not found" }, 404);
    }

    // Verify team ownership
    const request = await ctx.runQuery(internal.approvalBroker.getByRequestIdInternal, {
      requestId,
    });

    if (!request) {
      return jsonResponse({ code: 404, message: "Approval request not found" }, 404);
    }

    if (request.teamId !== taskRun.teamId) {
      return jsonResponse({ code: 403, message: "Forbidden" }, 403);
    }

    const result = await ctx.runMutation(internal.approvalBroker.resolveRequestInternal, {
      requestId,
      resolution: payload.resolution,
      resolvedBy: "http_api",
      note: payload.note,
    });

    return jsonResponse({
      ok: true,
      status: result.status,
    });
  } catch (error) {
    console.error("[approvalBroker_http] Failed to resolve approval", error);
    const message = error instanceof Error ? error.message : "Failed to resolve approval";
    return jsonResponse({ code: 500, message }, 500);
  }
});
