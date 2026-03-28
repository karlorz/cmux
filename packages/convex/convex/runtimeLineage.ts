/**
 * Runtime Lineage - Append-only records of run-to-run relationships.
 *
 * Unlike providerSessionBindings (mutable current-binding state), lineage records
 * are never updated after creation. This enables durable ancestry tracking
 * that survives session rebinds.
 *
 * Use cases:
 * - Track how a run relates to previous runs (retry, resume, handoff)
 * - Query full resume chain for a task
 * - Understand continuation patterns over time
 */

import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery } from "./users/utils";

// =============================================================================
// Validators
// =============================================================================

const continuationModeValidator = v.union(
  v.literal("initial"), // First run, no previous
  v.literal("retry"), // Automatic retry after failure
  v.literal("manual_resume"), // User explicitly resumed
  v.literal("checkpoint_restore"), // Restored from checkpoint
  v.literal("session_continuation"), // Provider session continuation
  v.literal("handoff"), // Handoff from another agent
  v.literal("reconnect") // Network reconnect to same session
);

const actorValidator = v.union(
  v.literal("system"), // Automatic (retry, reconnect)
  v.literal("user"), // User action in UI
  v.literal("operator"), // Operator/admin action
  v.literal("agent"), // Agent initiated (handoff)
  v.literal("hook"), // Hook triggered
  v.literal("queue") // Queue processor
);

// =============================================================================
// Internal Mutations
// =============================================================================

/**
 * Record a lineage entry when a run starts or resumes.
 * Called internally when creating/resuming task runs.
 */
export const recordLineage = internalMutation({
  args: {
    teamId: v.string(),
    taskRunId: v.id("taskRuns"),
    previousTaskRunId: v.optional(v.id("taskRuns")),
    continuationMode: continuationModeValidator,
    providerSessionId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    resumeReason: v.optional(v.string()),
    checkpointRef: v.optional(v.string()),
    checkpointGeneration: v.optional(v.number()),
    actor: v.optional(actorValidator),
    agentName: v.optional(v.string()),
    orchestrationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const id = await ctx.db.insert("runtimeLineage", {
      ...args,
      createdAt: Date.now(),
    });
    return { lineageId: id };
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get lineage for a specific task run.
 */
export const getByTaskRun = internalQuery({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runtimeLineage")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .first();
  },
});

/**
 * Get all runs that continued from a given run.
 */
export const getChildRuns = internalQuery({
  args: {
    previousTaskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("runtimeLineage")
      .withIndex("by_previous_run", (q) =>
        q.eq("previousTaskRunId", args.previousTaskRunId)
      )
      .collect();
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get full lineage chain for a task run (walking backwards to initial run).
 * Returns array from oldest ancestor to current run.
 */
export const getLineageChain = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    maxDepth: v.optional(v.number()), // Default 10 to prevent infinite loops
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const maxDepth = args.maxDepth ?? 10;

    const chain: Array<{
      taskRunId: string;
      previousTaskRunId?: string;
      continuationMode: string;
      resumeReason?: string;
      actor?: string;
      agentName?: string;
      createdAt: number;
    }> = [];

    let currentRunId: typeof args.taskRunId | undefined = args.taskRunId;
    let depth = 0;

    while (currentRunId && depth < maxDepth) {
      const lineage = await ctx.db
        .query("runtimeLineage")
        .withIndex("by_task_run", (q) => q.eq("taskRunId", currentRunId!))
        .first();

      if (!lineage || lineage.teamId !== teamId) {
        break;
      }

      chain.unshift({
        taskRunId: lineage.taskRunId,
        previousTaskRunId: lineage.previousTaskRunId,
        continuationMode: lineage.continuationMode,
        resumeReason: lineage.resumeReason,
        actor: lineage.actor,
        agentName: lineage.agentName,
        createdAt: lineage.createdAt,
      });

      currentRunId = lineage.previousTaskRunId;
      depth++;
    }

    return {
      chain,
      depth: chain.length,
      reachedInitial:
        chain.length > 0 && chain[0].continuationMode === "initial",
      truncated: depth >= maxDepth && currentRunId !== undefined,
    };
  },
});

/**
 * Get lineage summary for a task run (current lineage entry only).
 */
export const getLineageSummary = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const lineage = await ctx.db
      .query("runtimeLineage")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .first();

    if (!lineage || lineage.teamId !== teamId) {
      return null;
    }

    // Count how many runs continued from this one
    const childRuns = await ctx.db
      .query("runtimeLineage")
      .withIndex("by_previous_run", (q) =>
        q.eq("previousTaskRunId", args.taskRunId)
      )
      .collect();

    return {
      taskRunId: lineage.taskRunId,
      previousTaskRunId: lineage.previousTaskRunId,
      continuationMode: lineage.continuationMode,
      providerSessionId: lineage.providerSessionId,
      providerThreadId: lineage.providerThreadId,
      resumeReason: lineage.resumeReason,
      checkpointRef: lineage.checkpointRef,
      actor: lineage.actor,
      agentName: lineage.agentName,
      createdAt: lineage.createdAt,
      // Computed fields
      isInitial: lineage.continuationMode === "initial",
      isResumed: lineage.continuationMode !== "initial",
      hasCheckpoint: !!lineage.checkpointRef,
      childRunCount: childRuns.length,
    };
  },
});
