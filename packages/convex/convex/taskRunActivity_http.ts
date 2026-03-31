import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { typedZid } from "@cmux/shared/utils/typed-zid";

/**
 * Activity event types for dashboard timeline.
 *
 * This list includes:
 * 1. Canonical lifecycle events from agent-comm-events.ts (normalized naming)
 * 2. Dashboard-specific events (tool_call, thinking, etc.) not in canonical set
 *
 * Naming convention: Use canonical names (e.g., session_started, session_stop_requested)
 * to align with CANONICAL_EVENT_TYPES in agent-comm-events.ts.
 *
 * Legacy aliases are handled via CLIENT_TYPE_ALIASES for backward compatibility.
 */
const ACTIVITY_TYPES = [
  // Tool-use events (dashboard-specific)
  "tool_call",
  "file_edit",
  "file_read",
  "bash_command",
  "test_run",
  "git_commit",
  "error",
  "thinking",
  // Session lifecycle events (canonical names)
  "session_started", // was: session_start
  "session_resumed",
  "session_finished",
  // Stop lifecycle events (canonical names)
  "session_stop_requested", // was: stop_requested
  "session_stop_blocked", // was: stop_blocked
  "session_stop_failed", // was: stop_failed
  // Context health events (canonical)
  "context_warning",
  "context_compacted",
  // Memory events (canonical)
  "memory_loaded",
  "memory_scope_changed",
  // Tool lifecycle events (canonical)
  "tool_requested",
  "tool_completed",
  // Approval flow events (canonical names)
  "approval_required", // was: approval_requested
  "approval_resolved",
  // Interaction events (dashboard-specific)
  "user_prompt",
  "subagent_start",
  "subagent_stop",
  "notification",
  // Prompt/Turn tracking events (canonical)
  "prompt_submitted",
  "run_resumed",
  // MCP runtime events (canonical)
  "mcp_capabilities_negotiated",
  // Hook portability events (Phase 5)
  "task_created",
  "plan_sync",
  "simplify_track",
  "precompact",
  "postcompact",
  "simplify_gate",
] as const;

/**
 * Aliases for backward compatibility with legacy event names.
 * Maps old names to canonical names for client-side migration.
 */
export const ACTIVITY_TYPE_ALIASES: Record<string, typeof ACTIVITY_TYPES[number]> = {
  session_start: "session_started",
  session_stop: "session_stop_requested",
  stop_requested: "session_stop_requested",
  stop_blocked: "session_stop_blocked",
  stop_failed: "session_stop_failed",
  approval_requested: "approval_required",
};

/**
 * Schema for activity events posted by agent hooks.
 *
 * Base fields (required): taskRunId, type, summary
 * Tool fields (optional): toolName, detail, durationMs
 * Context health fields (optional): severity, warningType, currentUsage, maxCapacity, usagePercent
 * Stop lifecycle fields (optional): stopSource, exitCode, continuationPrompt
 * Approval fields (optional): approvalId, resolution, resolvedBy
 * Memory scope fields (optional): scopeType, scopeBytes, scopeAction
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
  // Stop lifecycle fields (Phase 4 - stop_requested/blocked/failed events)
  stopSource: z.enum(["user", "hook", "autopilot", "policy", "timeout", "error"]).optional(),
  exitCode: z.number().optional(),
  continuationPrompt: z.string().max(2000).optional(),
  // Approval fields (Phase 4 - approval_requested/resolved events)
  approvalId: z.string().max(100).optional(),
  resolution: z
    .enum(["allow", "allow_once", "allow_session", "deny", "deny_always", "timeout"])
    .optional(),
  resolvedBy: z.string().max(100).optional(),
  // Memory scope fields (Phase 4 - memory_scope_changed events)
  scopeType: z.enum(["team", "repo", "user", "run"]).optional(),
  scopeBytes: z.number().nonnegative().optional(),
  scopeAction: z.enum(["injected", "updated", "cleared"]).optional(),
  // Prompt/Turn tracking fields (P1 Lifecycle Parity - prompt_submitted/session_finished/run_resumed)
  promptSource: z.enum(["user", "operator", "hook", "queue", "handoff"]).optional(),
  turnNumber: z.number().nonnegative().optional(),
  promptLength: z.number().nonnegative().optional(),
  turnCount: z.number().nonnegative().optional(),
  providerSessionId: z.string().max(200).optional(),
  // Resume fields (P1 - run_resumed events)
  resumeReason: z.enum(["checkpoint", "reconnect", "handoff", "retry", "manual"]).optional(),
  previousTaskRunId: z.string().max(100).optional(),
  previousSessionId: z.string().max(200).optional(),
  checkpointRef: z.string().max(200).optional(),
  // MCP runtime fields (P5 Lifecycle Parity - mcp_capabilities_negotiated)
  serverName: z.string().max(100).optional(),
  serverId: z.string().max(100).optional(),
  protocolVersion: z.string().max(20).optional(),
  transport: z.enum(["stdio", "http", "sse", "websocket"]).optional(),
  mcpCapabilities: z.object({
    tools: z.boolean().optional(),
    resources: z.boolean().optional(),
    prompts: z.boolean().optional(),
    tasks: z.boolean().optional(),
    logging: z.boolean().optional(),
    completions: z.boolean().optional(),
  }).optional(),
  toolCount: z.number().nonnegative().optional(),
  resourceCount: z.number().nonnegative().optional(),
  mcpSessionId: z.string().max(200).optional(),
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

  const { taskRunId, mcpCapabilities, ...eventData } = validation.data;

  // Verify the caller owns this task run
  if (auth.payload.taskRunId !== taskRunId) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  await ctx.runMutation(internal.taskRunActivity.insert, {
    taskRunId,
    teamId: auth.payload.teamId,
    ...eventData,
    // Serialize mcpCapabilities object to JSON string for storage
    ...(mcpCapabilities ? { mcpCapabilities: JSON.stringify(mcpCapabilities) } : {}),
  });

  return jsonResponse({ ok: true });
});
