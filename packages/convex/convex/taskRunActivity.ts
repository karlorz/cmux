import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * Internal mutation called by the HTTP endpoint after JWT validation.
 * Inserts a single agent activity event for real-time dashboard streaming.
 *
 * Extended to support canonical lifecycle events (context health, session lifecycle).
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
