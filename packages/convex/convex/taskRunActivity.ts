import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * Internal mutation called by the HTTP endpoint after JWT validation.
 * Inserts a single agent activity event for real-time dashboard streaming.
 *
 * Extended to support canonical lifecycle events (context health, session lifecycle).
 * Phase 4 adds: stop lifecycle, approval flow, memory scope events.
 */
export const insert = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    type: v.string(),
    toolName: v.optional(v.string()),
    summary: v.string(),
    detail: v.optional(v.string()),
    durationMs: v.optional(v.number()),
    teamId: v.string(),
    // Context health fields (for context_warning/context_compacted events)
    severity: v.optional(v.string()),
    warningType: v.optional(v.string()),
    currentUsage: v.optional(v.number()),
    maxCapacity: v.optional(v.number()),
    usagePercent: v.optional(v.number()),
    // Context compacted fields
    previousBytes: v.optional(v.number()),
    newBytes: v.optional(v.number()),
    reductionPercent: v.optional(v.number()),
    // Stop lifecycle fields (Phase 4 - stop_requested/blocked/failed events)
    stopSource: v.optional(v.string()),
    exitCode: v.optional(v.number()),
    continuationPrompt: v.optional(v.string()),
    // Approval fields (Phase 4 - approval_requested/resolved events)
    approvalId: v.optional(v.string()),
    resolution: v.optional(v.string()),
    resolvedBy: v.optional(v.string()),
    // Memory scope fields (Phase 4 - memory_scope_changed events)
    scopeType: v.optional(v.string()),
    scopeBytes: v.optional(v.number()),
    scopeAction: v.optional(v.string()),
    // Prompt/Turn tracking fields (P1 - prompt_submitted/session_finished/run_resumed)
    promptSource: v.optional(v.string()),
    turnNumber: v.optional(v.number()),
    promptLength: v.optional(v.number()),
    turnCount: v.optional(v.number()),
    providerSessionId: v.optional(v.string()),
    // Resume fields (P1 - run_resumed events)
    resumeReason: v.optional(v.string()),
    previousTaskRunId: v.optional(v.string()),
    previousSessionId: v.optional(v.string()),
    checkpointRef: v.optional(v.string()),
    // MCP runtime fields (P5 - mcp_capabilities_negotiated events)
    serverName: v.optional(v.string()),
    serverId: v.optional(v.string()),
    protocolVersion: v.optional(v.string()),
    transport: v.optional(v.string()),
    mcpCapabilities: v.optional(v.string()), // JSON stringified capabilities object
    toolCount: v.optional(v.number()),
    resourceCount: v.optional(v.number()),
    mcpSessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("taskRunActivity", {
      ...args,
      createdAt: Date.now(),
    });
  },
});

/**
 * Query activity events for a task run, ordered by creation time (newest first).
 * Used by the ActivityStream dashboard component via Convex real-time subscription.
 */
export const getByTaskRun = query({
  args: {
    taskRunId: v.id("taskRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRunActivity")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("desc")
      .take(args.limit ?? 200);
  },
});

/**
 * Query activity events for a task run, ordered oldest-first for timeline rendering.
 */
export const getByTaskRunAsc = query({
  args: {
    taskRunId: v.id("taskRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRunActivity")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("asc")
      .take(args.limit ?? 200);
  },
});
