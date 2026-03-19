import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { typedZid } from "@cmux/shared/utils/typed-zid";

const ACTIVITY_TYPES = [
  "tool_call",
  "file_edit",
  "file_read",
  "bash_command",
  "test_run",
  "git_commit",
  "error",
  "thinking",
] as const;

const ActivityEventSchema = z.object({
  taskRunId: typedZid("taskRuns"),
  type: z.enum(ACTIVITY_TYPES),
  toolName: z.string().max(100).optional(),
  summary: z.string().max(500),
  detail: z.string().max(10_000).optional(),
  durationMs: z.number().nonnegative().optional(),
});

/**
 * HTTP endpoint called by agent PostToolUse hooks to report activity events.
 * These events power the real-time ActivityStream dashboard component.
 *
 * Auth: x-cmux-token JWT (same as crown/complete, notifications)
 * Body: { taskRunId, type, toolName?, summary, detail?, durationMs? }
 */
export const postActivity = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[taskRunActivity]",
  });
  if (!auth) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return jsonResponse(
      { code: 415, message: "Content-Type must be application/json" },
      415
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON body" }, 400);
  }

  const validation = ActivityEventSchema.safeParse(json);
  if (!validation.success) {
    return jsonResponse({ code: 400, message: "Invalid input" }, 400);
  }

  const { taskRunId, ...eventData } = validation.data;

  // Verify the caller owns this task run
  if (auth.payload.taskRunId !== taskRunId) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  await ctx.runMutation(internal.taskRunActivity.insert, {
    taskRunId,
    teamId: auth.payload.teamId,
    ...eventData,
  });

  return jsonResponse({ ok: true });
});
