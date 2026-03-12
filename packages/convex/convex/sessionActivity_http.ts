/**
 * HTTP Actions for Session Activity with JWT Authentication
 *
 * These endpoints allow sandbox hooks to record session activity
 * (commits, PRs, files changed) using their task-run JWT for authentication.
 *
 * Endpoints:
 * - POST /api/session-activity/start - Record session start
 * - POST /api/session-activity/end - Record session end with activity data
 */

import { verifyTaskRunToken } from "../../shared/src/convex-safe";
import { env } from "../_shared/convex-env";
import { jsonResponse, extractBearerToken } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { httpAction } from "./_generated/server";
import { z } from "zod";

// Schema for session start request
const sessionStartSchema = z.object({
  sessionId: z.string().min(1),
  startCommit: z.string().min(1),
});

// Schema for commit data
const commitSchema = z.object({
  sha: z.string(),
  message: z.string(),
  timestamp: z.string(),
  filesChanged: z.number(),
  additions: z.number(),
  deletions: z.number(),
});

// Schema for PR data
const prSchema = z.object({
  number: z.number(),
  title: z.string(),
  url: z.string(),
  mergedAt: z.string(),
  additions: z.number(),
  deletions: z.number(),
  filesChanged: z.number(),
});

// Schema for file change data
const fileChangeSchema = z.object({
  path: z.string(),
  additions: z.number(),
  deletions: z.number(),
  status: z.enum(["added", "modified", "deleted", "renamed"]),
});

// Schema for session end request
const sessionEndSchema = z.object({
  sessionId: z.string().min(1),
  endCommit: z.string().min(1),
  commits: z.array(commitSchema),
  prsMerged: z.array(prSchema),
  filesChanged: z.array(fileChangeSchema),
});

/**
 * Verify JWT from request headers, returning payload or an error Response.
 * Supports both X-Task-Run-JWT header and Authorization Bearer token.
 */
async function authenticateRequest(
  req: Request
): Promise<{ taskRunId: string; teamId: string } | Response> {
  // Support both X-Task-Run-JWT header and Bearer token
  const taskRunJwt = req.headers.get("x-task-run-jwt");
  const authHeader = req.headers.get("authorization");
  const bearerToken = extractBearerToken(authHeader);
  const token = taskRunJwt ?? bearerToken;

  if (!token) {
    return jsonResponse(
      { code: 401, message: "Missing X-Task-Run-JWT header or Bearer token" },
      401
    );
  }

  try {
    const tokenPayload = await verifyTaskRunToken(
      token,
      env.CMUX_TASK_RUN_JWT_SECRET
    );
    return { taskRunId: tokenPayload.taskRunId, teamId: tokenPayload.teamId };
  } catch (error) {
    console.error("[sessionActivity_http] Failed to verify JWT", error);
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
 * POST /api/session-activity/start
 *
 * Record session activity start.
 * Called by hooks at session start.
 */
export const recordStart = httpAction(async (ctx, req) => {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  const authResult = await authenticateRequest(req);
  if (authResult instanceof Response) return authResult;
  const { taskRunId, teamId } = authResult;

  // Parse request body
  let body: z.infer<typeof sessionStartSchema>;
  try {
    const json = await req.json();
    body = sessionStartSchema.parse(json);
  } catch (error) {
    return jsonResponse(
      { code: 400, message: "Invalid request body", details: String(error) },
      400
    );
  }

  try {
    const activityId = await ctx.runMutation(
      internal.sessionActivity.recordSessionStart,
      {
        taskRunId: taskRunId as Id<"taskRuns">,
        sessionId: body.sessionId,
        startCommit: body.startCommit,
        teamId,
      }
    );

    return jsonResponse({ success: true, activityId });
  } catch (error) {
    console.error("[sessionActivity_http] Failed to record session start:", error);
    return jsonResponse(
      { code: 500, message: "Failed to record session start", details: String(error) },
      500
    );
  }
});

/**
 * POST /api/session-activity/end
 *
 * Record session activity end.
 * Called by hooks at session wrap-up.
 */
export const recordEnd = httpAction(async (ctx, req) => {
  const contentTypeError = requireJsonContentType(req);
  if (contentTypeError) return contentTypeError;

  const authResult = await authenticateRequest(req);
  if (authResult instanceof Response) return authResult;

  // Parse request body
  let body: z.infer<typeof sessionEndSchema>;
  try {
    const json = await req.json();
    body = sessionEndSchema.parse(json);
  } catch (error) {
    return jsonResponse(
      { code: 400, message: "Invalid request body", details: String(error) },
      400
    );
  }

  // Find existing session activity by sessionId
  const activity = await ctx.runQuery(internal.sessionActivity.getBySessionId, {
    sessionId: body.sessionId,
  });

  if (!activity) {
    return jsonResponse(
      { code: 404, message: "Session activity not found", sessionId: body.sessionId },
      404
    );
  }

  try {
    await ctx.runMutation(internal.sessionActivity.recordSessionEnd, {
      sessionActivityId: activity._id,
      endCommit: body.endCommit,
      commits: body.commits,
      prsMerged: body.prsMerged,
      filesChanged: body.filesChanged,
    });

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("[sessionActivity_http] Failed to record session end:", error);
    return jsonResponse(
      { code: 500, message: "Failed to record session end", details: String(error) },
      500
    );
  }
});
