import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

/**
 * Internal mutation to insert a resource metrics sample.
 * Called by the worker via HTTP endpoint after JWT validation.
 */
export const insert = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    cpuPercent: v.number(),
    memoryMB: v.number(),
    memoryPercent: v.number(),
    timestamp: v.number(),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("taskRunResourceMetrics", args);
  },
});

/**
 * Query resource metrics for a task run, ordered by timestamp (ascending for timeline).
 */
export const getByTaskRun = query({
  args: {
    taskRunId: v.id("taskRuns"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("taskRunResourceMetrics")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("asc")
      .take(args.limit ?? 500);
  },
});

/**
 * Get the latest resource metrics sample for a task run.
 */
export const getLatestByTaskRun = query({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("taskRunResourceMetrics")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .order("desc")
      .first();
    return metrics ?? null;
  },
});

/**
 * Get aggregated resource stats for a task run (min, max, avg).
 */
export const getStatsByTaskRun = query({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const metrics = await ctx.db
      .query("taskRunResourceMetrics")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();

    if (metrics.length === 0) {
      return null;
    }

    const cpuValues = metrics.map((m) => m.cpuPercent);
    const memoryMBValues = metrics.map((m) => m.memoryMB);
    const memoryPercentValues = metrics.map((m) => m.memoryPercent);

    const sum = (arr: number[]) => arr.reduce((a, b) => a + b, 0);

    return {
      sampleCount: metrics.length,
      cpu: {
        min: Math.min(...cpuValues),
        max: Math.max(...cpuValues),
        avg: sum(cpuValues) / cpuValues.length,
      },
      memoryMB: {
        min: Math.min(...memoryMBValues),
        max: Math.max(...memoryMBValues),
        avg: sum(memoryMBValues) / memoryMBValues.length,
      },
      memoryPercent: {
        min: Math.min(...memoryPercentValues),
        max: Math.max(...memoryPercentValues),
        avg: sum(memoryPercentValues) / memoryPercentValues.length,
      },
      firstTimestamp: metrics[0].timestamp,
      lastTimestamp: metrics[metrics.length - 1].timestamp,
      durationMs: metrics[metrics.length - 1].timestamp - metrics[0].timestamp,
    };
  },
});
