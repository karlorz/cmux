/**
 * Runtime Interruptions HTTP API
 *
 * P2: Generalized runtime interruptions for agents to report pause, checkpoint,
 * handoff, and other blocking states with provider session binding and
 * checkpoint references for replay-safe resume.
 *
 * This extends the approval model to support:
 * - Typed interruption categories (not just approvals)
 * - Provider session binding (Codex thread_id, Claude session, etc.)
 * - Checkpoint references for LangGraph-style durable execution
 * - Resume ancestry tracking
 */

import { z } from "zod";
import { jsonResponse } from "../_shared/http-utils";
import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { getWorkerAuth } from "./users/utils/getWorkerAuth";
import { typedZid } from "@cmux/shared/utils/typed-zid";

/**
 * Interruption types for the generalized runtime model.
 */
const INTERRUPTION_TYPES = [
  "approval_pending",
  "paused_by_operator",
  "sandbox_paused",
  "context_overflow",
  "rate_limited",
  "timed_out",
  // P2: Extended types
  "checkpoint_pending",
  "handoff_pending",
  "user_input_required",
] as const;

/**
 * Schema for reporting a runtime interruption.
 */
const ReportInterruptionSchema = z.object({
  taskRunId: typedZid("taskRuns"),
  status: z.enum(INTERRUPTION_TYPES),
  reason: z.string().max(1000).optional(),
  // Expiry for auto-resume or timeout
  expiresInMs: z.number().positive().optional(),
  // Provider-specific resume token
  resumeToken: z.string().max(10_000).optional(),
  // P2: Provider session binding
  providerSessionId: z.string().max(500).optional(),
  resumeTargetId: z.string().max(500).optional(),
  // P2: Checkpoint reference
  checkpointRef: z.string().max(2000).optional(),
  checkpointGeneration: z.number().nonnegative().optional(),
  // Link to approval request if this is approval-based
  approvalRequestId: z.string().max(100).optional(),
});

/**
 * Schema for resolving (resuming from) an interruption.
 */
const ResolveInterruptionSchema = z.object({
  taskRunId: typedZid("taskRuns"),
  resolvedBy: z.string().max(200).optional(),
});

/**
 * POST /api/runtime/interrupt
 *
 * Report a runtime interruption. Called by agents when they enter a blocking
 * state that requires operator action or external resolution.
 */
export const reportInterruption = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[runtimeInterruptions]",
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON body" }, 400);
  }

  const parsed = ReportInterruptionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { code: 400, message: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  const { taskRunId, status, reason, expiresInMs, ...rest } = parsed.data;

  // Verify the caller owns this task run
  if (auth.payload.taskRunId !== taskRunId) {
    return jsonResponse({ code: 403, message: "Forbidden" }, 403);
  }

  try {
    await ctx.runMutation(internal.taskRuns.setInterruptionState, {
      taskRunId,
      status,
      reason,
      expiresAt: expiresInMs ? Date.now() + expiresInMs : undefined,
      resumeToken: rest.resumeToken,
      providerSessionId: rest.providerSessionId,
      resumeTargetId: rest.resumeTargetId,
      checkpointRef: rest.checkpointRef,
      checkpointGeneration: rest.checkpointGeneration,
      approvalRequestId: rest.approvalRequestId,
    });

    return jsonResponse({
      ok: true,
      taskRunId,
      status,
      message: `Interruption reported: ${status}`,
    });
  } catch (error) {
    console.error("[runtimeInterruptions] Failed to report interruption:", error);
    return jsonResponse(
      { code: 500, message: "Failed to report interruption" },
      500
    );
  }
});

/**
 * POST /api/runtime/resume
 *
 * Resolve a runtime interruption. Called when an operator or system
 * action clears the blocking state.
 */
export const resolveInterruption = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[runtimeInterruptions]",
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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ code: 400, message: "Invalid JSON body" }, 400);
  }

  const parsed = ResolveInterruptionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse(
      { code: 400, message: "Validation failed", details: parsed.error.flatten() },
      400
    );
  }

  const { taskRunId, resolvedBy } = parsed.data;

  // Verify the caller owns this task run
  if (auth.payload.taskRunId !== taskRunId) {
    return jsonResponse({ code: 403, message: "Forbidden" }, 403);
  }

  try {
    await ctx.runMutation(internal.taskRuns.resolveInterruption, {
      taskRunId,
      resolvedBy,
    });

    return jsonResponse({
      ok: true,
      taskRunId,
      message: "Interruption resolved",
    });
  } catch (error) {
    console.error("[runtimeInterruptions] Failed to resolve interruption:", error);
    return jsonResponse(
      { code: 500, message: "Failed to resolve interruption" },
      500
    );
  }
});

/**
 * GET /api/runtime/interruption-state?taskRunId=...
 *
 * Query the current interruption state for a task run.
 * Useful for agents to check if they should resume or wait.
 */
export const getInterruptionState = httpAction(async (ctx, req) => {
  const auth = await getWorkerAuth(req, {
    loggerPrefix: "[runtimeInterruptions]",
  });
  if (!auth) {
    return jsonResponse({ code: 401, message: "Unauthorized" }, 401);
  }

  const url = new URL(req.url);
  const taskRunIdRaw = url.searchParams.get("taskRunId");

  if (!taskRunIdRaw) {
    return jsonResponse(
      { code: 400, message: "Missing taskRunId query parameter" },
      400
    );
  }

  const taskRunId = typedZid("taskRuns").safeParse(taskRunIdRaw);
  if (!taskRunId.success) {
    return jsonResponse(
      { code: 400, message: "Invalid taskRunId format" },
      400
    );
  }

  // Verify the caller owns this task run
  if (auth.payload.taskRunId !== taskRunId.data) {
    return jsonResponse({ code: 403, message: "Forbidden" }, 403);
  }

  try {
    const state = await ctx.runQuery(internal.taskRuns.isInterrupted, {
      taskRunId: taskRunId.data,
    });

    return jsonResponse(state);
  } catch (error) {
    console.error("[runtimeInterruptions] Failed to get interruption state:", error);
    return jsonResponse(
      { code: 500, message: "Failed to get interruption state" },
      500
    );
  }
});
