import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { typedZid } from "@cmux/shared/utils/typed-zid";

/**
 * Activity event types for dashboard timeline.
 * Extended to include canonical lifecycle events from agent-comm-events.ts.
 */
const ACTIVITY_TYPES = [
  // Tool-use events (original)
  "tool_call",
  "file_edit",
  "file_read",
  "bash_command",
  "test_run",
  "git_commit",
  "error",
  "thinking",
  // Session lifecycle events (Phase 2)
  "session_start",
  "session_stop",
  "session_resumed",
  // Context health events (Phase 2)
  "context_warning",
  "context_compacted",
  // Memory events (Phase 2)
  "memory_loaded",
  // Interaction events (Phase 2)
  "user_prompt",
  "subagent_start",
  "subagent_stop",
  "notification",
] as const;

/**
 * Schema for activity events posted by agent hooks.
 *
 * Base fields (required): taskRunId, type, summary
 * Tool fields (optional): toolName, detail, durationMs
 * Context health fields (optional): severity, warningType, currentUsage, maxCapacity, usagePercent
 */
const ActivityEventSchema = z.object({
  taskRunId: typedZid("taskRuns"),
  type: z.enum(ACTIVITY_TYPES),
  toolName: z.string().max(100).optional(),
  summary: z.string().max(500),
  detail: z.string().max(10_000).optional(),
  durationMs: z.number().nonnegative().optional(),
  // Context health fields (for context_warning/context_compacted events)
  severity: z.enum(["info", "warning", "critical"]).optional(),
  warningType: z
    .enum(["memory_bloat", "tool_output", "prompt_size", "capacity", "token_limit"])
    .optional(),
  currentUsage: z.number().nonnegative().optional(),
  maxCapacity: z.number().nonnegative().optional(),
  usagePercent: z.number().min(0).max(100).optional(),
  // Context compacted fields
  previousBytes: z.number().nonnegative().optional(),
  newBytes: z.number().nonnegative().optional(),
  reductionPercent: z.number().min(0).max(100).optional(),
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
