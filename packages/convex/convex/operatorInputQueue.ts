/**
 * Operator Input Queue - Active-Turn Steering for Head Agents
 *
 * Provides a bounded queue for operator instructions during agent turns.
 * Instructions are queued while agents are mid-turn (processing, awaiting approval)
 * and drained/merged at turn boundaries.
 *
 * Based on IronClaw design principles:
 * - Bounded capacity prevents context bloat
 * - Priority ordering (high > normal > low)
 * - Merge with newlines at drain time
 * - Clear semantics for interrupts
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";
import { getTeamId } from "../_shared/team";
import type { Id } from "./_generated/dataModel";

/** Default queue capacity per orchestration */
export const DEFAULT_QUEUE_CAPACITY = 20;
/** Minimum allowed queue capacity */
const MIN_QUEUE_CAPACITY = 5;
/** Maximum allowed queue capacity */
const MAX_QUEUE_CAPACITY = 100;

type InputPriority = "high" | "normal" | "low";

/**
 * Priority sort order: high (0) > normal (1) > low (2)
 */
function priorityRank(priority: InputPriority): number {
  switch (priority) {
    case "high":
      return 0;
    case "normal":
      return 1;
    case "low":
      return 2;
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get queue status for an orchestration.
 * Returns depth, capacity, and whether the queue has pending inputs.
 */
export const getQueueStatus = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    queueCapacity: v.optional(v.number()),
  },
  returns: v.object({
    depth: v.number(),
    capacity: v.number(),
    hasPendingInputs: v.boolean(),
    oldestInputAt: v.optional(v.number()),
  }),
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const capacity = Math.max(
      MIN_QUEUE_CAPACITY,
      Math.min(args.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, MAX_QUEUE_CAPACITY)
    );

    const pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    // Filter by team for security
    const teamInputs = pendingInputs.filter((i) => i.teamId === teamId);

    return {
      depth: teamInputs.length,
      capacity,
      hasPendingInputs: teamInputs.length > 0,
      oldestInputAt: teamInputs.length > 0 ? Math.min(...teamInputs.map((i) => i.queuedAt)) : undefined,
    };
  },
});

/**
 * Get pending inputs for an orchestration (internal use).
 * Returns inputs sorted by priority then queue time.
 */
export const getPendingInputsInternal = internalQuery({
  args: {
    orchestrationId: v.string(),
    teamId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("operatorInputQueue"),
      content: v.string(),
      priority: v.union(v.literal("high"), v.literal("normal"), v.literal("low")),
      queuedAt: v.number(),
      userId: v.string(),
    })
  ),
  handler: async (ctx, args) => {
    const pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    // Filter by team and sort by priority then queuedAt
    const teamInputs = pendingInputs
      .filter((i) => i.teamId === args.teamId)
      .sort((a, b) => {
        const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return a.queuedAt - b.queuedAt;
      });

    return teamInputs.map((i) => ({
      _id: i._id,
      content: i.content,
      priority: i.priority,
      queuedAt: i.queuedAt,
      userId: i.userId,
    }));
  },
});

// ============================================================================
// Mutations
// ============================================================================

/**
 * Queue an operator input for the next turn boundary.
 * Returns success or QUEUE_FULL error if at capacity.
 */
export const queueInput = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    content: v.string(),
    priority: v.optional(v.union(v.literal("high"), v.literal("normal"), v.literal("low"))),
    queueCapacity: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      inputId: v.id("operatorInputQueue"),
      queueDepth: v.number(),
    }),
    v.object({
      success: v.literal(false),
      error: v.literal("QUEUE_FULL"),
      queueDepth: v.number(),
      queueCapacity: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const capacity = Math.max(
      MIN_QUEUE_CAPACITY,
      Math.min(args.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, MAX_QUEUE_CAPACITY)
    );

    // Check current queue depth
    const pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    const teamInputs = pendingInputs.filter((i) => i.teamId === teamId);

    if (teamInputs.length >= capacity) {
      return {
        success: false as const,
        error: "QUEUE_FULL" as const,
        queueDepth: teamInputs.length,
        queueCapacity: capacity,
      };
    }

    // Insert the input
    const inputId = await ctx.db.insert("operatorInputQueue", {
      orchestrationId: args.orchestrationId,
      taskRunId: args.taskRunId,
      teamId,
      userId,
      content: args.content.trim(),
      priority: args.priority ?? "normal",
      queuedAt: Date.now(),
      processedAt: undefined,
      drainedBatchId: undefined,
    });

    return {
      success: true as const,
      inputId,
      queueDepth: teamInputs.length + 1,
    };
  },
});

/**
 * Drain all pending inputs, merging with newlines.
 * Marks all drained inputs as processed with a batch ID.
 * Returns merged content and count of inputs drained.
 */
export const drainInputs = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
  },
  returns: v.object({
    content: v.string(),
    count: v.number(),
    batchId: v.string(),
    inputIds: v.array(v.id("operatorInputQueue")),
  }),
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();
    const batchId = `batch_${now.toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    // Get pending inputs
    let pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    // Filter by team and optionally by taskRunId
    pendingInputs = pendingInputs.filter((i) => {
      if (i.teamId !== teamId) return false;
      if (args.taskRunId && i.taskRunId && i.taskRunId !== args.taskRunId) return false;
      return true;
    });

    // Sort by priority then queuedAt
    pendingInputs.sort((a, b) => {
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.queuedAt - b.queuedAt;
    });

    // Mark all as processed
    const inputIds: Id<"operatorInputQueue">[] = [];
    for (const input of pendingInputs) {
      await ctx.db.patch(input._id, {
        processedAt: now,
        drainedBatchId: batchId,
      });
      inputIds.push(input._id);
    }

    // Merge content with newlines (IronClaw pattern)
    const mergedContent = pendingInputs.map((i) => i.content).join("\n\n");

    return {
      content: mergedContent,
      count: pendingInputs.length,
      batchId,
      inputIds,
    };
  },
});

/**
 * Clear all pending inputs (for interrupts).
 * Marks inputs as processed without returning content.
 */
export const clearQueue = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
  },
  returns: v.object({
    clearedCount: v.number(),
    batchId: v.string(),
  }),
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();
    const batchId = `clear_${now.toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    // Get pending inputs
    let pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    // Filter by team and optionally by taskRunId
    pendingInputs = pendingInputs.filter((i) => {
      if (i.teamId !== teamId) return false;
      if (args.taskRunId && i.taskRunId && i.taskRunId !== args.taskRunId) return false;
      return true;
    });

    // Mark all as processed (cleared)
    for (const input of pendingInputs) {
      await ctx.db.patch(input._id, {
        processedAt: now,
        drainedBatchId: batchId,
      });
    }

    return {
      clearedCount: pendingInputs.length,
      batchId,
    };
  },
});

// ============================================================================
// Internal Mutations (for background workers and MCP tools)
// ============================================================================

/**
 * Queue input internally (bypasses auth, used by MCP tools).
 */
export const queueInputInternal = internalMutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    content: v.string(),
    priority: v.optional(v.union(v.literal("high"), v.literal("normal"), v.literal("low"))),
    queueCapacity: v.optional(v.number()),
  },
  returns: v.union(
    v.object({
      success: v.literal(true),
      inputId: v.id("operatorInputQueue"),
      queueDepth: v.number(),
    }),
    v.object({
      success: v.literal(false),
      error: v.literal("QUEUE_FULL"),
      queueDepth: v.number(),
      queueCapacity: v.number(),
    })
  ),
  handler: async (ctx, args) => {
    const capacity = Math.max(
      MIN_QUEUE_CAPACITY,
      Math.min(args.queueCapacity ?? DEFAULT_QUEUE_CAPACITY, MAX_QUEUE_CAPACITY)
    );

    // Check current queue depth
    const pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    const teamInputs = pendingInputs.filter((i) => i.teamId === args.teamId);

    if (teamInputs.length >= capacity) {
      return {
        success: false as const,
        error: "QUEUE_FULL" as const,
        queueDepth: teamInputs.length,
        queueCapacity: capacity,
      };
    }

    // Insert the input
    const inputId = await ctx.db.insert("operatorInputQueue", {
      orchestrationId: args.orchestrationId,
      taskRunId: args.taskRunId,
      teamId: args.teamId,
      userId: args.userId,
      content: args.content.trim(),
      priority: args.priority ?? "normal",
      queuedAt: Date.now(),
      processedAt: undefined,
      drainedBatchId: undefined,
    });

    return {
      success: true as const,
      inputId,
      queueDepth: teamInputs.length + 1,
    };
  },
});

/**
 * Drain inputs internally (bypasses auth, used by agents via MCP).
 */
export const drainInputsInternal = internalMutation({
  args: {
    teamId: v.string(),
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
  },
  returns: v.object({
    content: v.string(),
    count: v.number(),
    batchId: v.string(),
    inputIds: v.array(v.id("operatorInputQueue")),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const batchId = `batch_${now.toString(36)}_${Math.random().toString(36).substring(2, 8)}`;

    // Get pending inputs
    let pendingInputs = await ctx.db
      .query("operatorInputQueue")
      .withIndex("by_orchestration_pending", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("processedAt", undefined)
      )
      .collect();

    // Filter by team and optionally by taskRunId
    pendingInputs = pendingInputs.filter((i) => {
      if (i.teamId !== args.teamId) return false;
      if (args.taskRunId && i.taskRunId && i.taskRunId !== args.taskRunId) return false;
      return true;
    });

    // Sort by priority then queuedAt
    pendingInputs.sort((a, b) => {
      const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
      if (priorityDiff !== 0) return priorityDiff;
      return a.queuedAt - b.queuedAt;
    });

    // Mark all as processed
    const inputIds: Id<"operatorInputQueue">[] = [];
    for (const input of pendingInputs) {
      await ctx.db.patch(input._id, {
        processedAt: now,
        drainedBatchId: batchId,
      });
      inputIds.push(input._id);
    }

    // Merge content with newlines (IronClaw pattern)
    const mergedContent = pendingInputs.map((i) => i.content).join("\n\n");

    return {
      content: mergedContent,
      count: pendingInputs.length,
      batchId,
      inputIds,
    };
  },
});
