import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Phase 4: Memory Quality & Lifecycle
 *
 * Implements freshness scoring, forgetting policies, and memory health tracking.
 * Enables intelligent memory curation instead of accumulation.
 */

// Freshness decay constants
const FRESHNESS_HALF_LIFE_DAYS = 30; // Freshness halves every 30 days
const MIN_FRESHNESS_SCORE = 0.1; // Minimum score before marking stale
const STALE_THRESHOLD_DAYS = 90; // Entries older than this are candidates for pruning

/**
 * Calculate freshness score based on age and usage.
 * Score decays exponentially over time but is boosted by usage.
 */
function calculateFreshnessScore(
  createdAt: number,
  lastUsedAt: number | undefined,
  usageCount: number
): number {
  const now = Date.now();
  const ageMs = now - createdAt;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);

  // Base decay: exponential half-life
  const decayFactor = Math.pow(0.5, ageDays / FRESHNESS_HALF_LIFE_DAYS);

  // Usage boost: each use adds 10% (capped at 2x)
  const usageBoost = Math.min(2.0, 1.0 + usageCount * 0.1);

  // Recency boost: if used recently, boost score
  let recencyBoost = 1.0;
  if (lastUsedAt) {
    const daysSinceUse = (now - lastUsedAt) / (1000 * 60 * 60 * 24);
    if (daysSinceUse < 7) {
      recencyBoost = 1.5; // Used in last week
    } else if (daysSinceUse < 30) {
      recencyBoost = 1.2; // Used in last month
    }
  }

  const score = decayFactor * usageBoost * recencyBoost;
  return Math.max(MIN_FRESHNESS_SCORE, Math.min(1.0, score));
}

/**
 * Record that a memory snapshot was used (loaded into a sandbox).
 * Updates usage count and freshness score.
 */
export const recordUsage = internalMutation({
  args: {
    snapshotId: v.id("agentMemorySnapshots"),
  },
  handler: async (ctx, args) => {
    const snapshot = await ctx.db.get(args.snapshotId);
    if (!snapshot) return;

    const now = Date.now();
    const usageCount = (snapshot.usageCount ?? 0) + 1;
    const freshnessScore = calculateFreshnessScore(
      snapshot.createdAt,
      now,
      usageCount
    );

    await ctx.db.patch(args.snapshotId, {
      lastUsedAt: now,
      usageCount,
      freshnessScore,
      lastFreshnessUpdate: now,
    });
  },
});

/**
 * Batch update freshness scores for all snapshots in a team.
 * Should be run periodically (e.g., daily cron job).
 */
export const updateTeamFreshness = internalMutation({
  args: {
    teamId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Get snapshots that haven't been updated recently
    const snapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_created", (q) => q.eq("teamId", args.teamId))
      .filter((q) =>
        q.or(
          q.eq(q.field("lastFreshnessUpdate"), undefined),
          q.lt(q.field("lastFreshnessUpdate"), oneDayAgo)
        )
      )
      .take(limit);

    let updated = 0;
    for (const snapshot of snapshots) {
      const freshnessScore = calculateFreshnessScore(
        snapshot.createdAt,
        snapshot.lastUsedAt,
        snapshot.usageCount ?? 0
      );

      await ctx.db.patch(snapshot._id, {
        freshnessScore,
        lastFreshnessUpdate: now,
      });
      updated++;
    }

    return { updated };
  },
});

/**
 * Get stale memory entries that are candidates for pruning.
 */
export const getStaleEntries = authQuery({
  args: {
    teamSlugOrId: v.string(),
    memoryType: v.optional(
      v.union(
        v.literal("knowledge"),
        v.literal("daily"),
        v.literal("tasks"),
        v.literal("mailbox")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;
    const now = Date.now();
    const staleThreshold = now - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

    let query = ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_created", (q) => q.eq("teamId", teamId))
      .filter((q) =>
        q.and(
          q.lt(q.field("createdAt"), staleThreshold),
          q.or(
            q.eq(q.field("freshnessScore"), undefined),
            q.lt(q.field("freshnessScore"), MIN_FRESHNESS_SCORE * 2)
          )
        )
      );

    const snapshots = await query.take(limit);

    // Filter by memory type if specified
    if (args.memoryType) {
      return snapshots.filter((s) => s.memoryType === args.memoryType);
    }

    return snapshots;
  },
});

/**
 * Prune stale memory entries.
 * Removes entries that are old and have low freshness scores.
 */
export const pruneStaleEntries = authMutation({
  args: {
    teamSlugOrId: v.string(),
    memoryType: v.optional(
      v.union(
        v.literal("knowledge"),
        v.literal("daily"),
        v.literal("tasks"),
        v.literal("mailbox")
      )
    ),
    maxEntries: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const maxEntries = args.maxEntries ?? 20;
    const now = Date.now();
    const staleThreshold = now - STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;

    // Get stale entries
    let query = ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_created", (q) => q.eq("teamId", teamId))
      .filter((q) =>
        q.and(
          q.lt(q.field("createdAt"), staleThreshold),
          q.or(
            q.eq(q.field("freshnessScore"), undefined),
            q.lt(q.field("freshnessScore"), MIN_FRESHNESS_SCORE * 2)
          )
        )
      );

    let snapshots = await query.take(maxEntries);

    // Filter by memory type if specified
    if (args.memoryType) {
      snapshots = snapshots.filter((s) => s.memoryType === args.memoryType);
    }

    if (args.dryRun) {
      return {
        wouldPrune: snapshots.length,
        entries: snapshots.map((s) => ({
          id: s._id,
          memoryType: s.memoryType,
          createdAt: s.createdAt,
          freshnessScore: s.freshnessScore,
        })),
      };
    }

    // Delete stale entries
    for (const snapshot of snapshots) {
      await ctx.db.delete(snapshot._id);
    }

    return { pruned: snapshots.length };
  },
});

/**
 * Get memory health summary for a team.
 * Shows distribution of freshness scores and identifies problem areas.
 */
export const getHealthSummary = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Get all snapshots
    const snapshots = await ctx.db
      .query("agentMemorySnapshots")
      .withIndex("by_team_created", (q) => q.eq("teamId", teamId))
      .collect();

    // Calculate stats by memory type
    const byType: Record<
      string,
      {
        count: number;
        fresh: number;
        stale: number;
        avgFreshness: number;
      }
    > = {};

    for (const snapshot of snapshots) {
      const type = snapshot.memoryType;
      if (!byType[type]) {
        byType[type] = { count: 0, fresh: 0, stale: 0, avgFreshness: 0 };
      }

      byType[type].count++;

      const freshness = snapshot.freshnessScore ?? 0.5; // Default to 0.5 if not calculated
      byType[type].avgFreshness += freshness;

      if (freshness >= 0.5) {
        byType[type].fresh++;
      } else if (freshness < MIN_FRESHNESS_SCORE * 2) {
        byType[type].stale++;
      }
    }

    // Calculate averages
    for (const type of Object.keys(byType)) {
      if (byType[type].count > 0) {
        byType[type].avgFreshness /= byType[type].count;
      }
    }

    // Overall health score
    const totalFreshness = snapshots.reduce(
      (sum, s) => sum + (s.freshnessScore ?? 0.5),
      0
    );
    const overallHealth =
      snapshots.length > 0 ? totalFreshness / snapshots.length : 1.0;

    return {
      totalSnapshots: snapshots.length,
      overallHealth,
      byType,
      recommendations: generateHealthRecommendations(byType, overallHealth),
    };
  },
});

function generateHealthRecommendations(
  byType: Record<string, { count: number; fresh: number; stale: number; avgFreshness: number }>,
  overallHealth: number
): string[] {
  const recommendations: string[] = [];

  if (overallHealth < 0.5) {
    recommendations.push(
      "Overall memory health is low. Consider running pruneStaleEntries to clean up old data."
    );
  }

  for (const [type, stats] of Object.entries(byType)) {
    if (stats.stale > stats.count * 0.3) {
      recommendations.push(
        `${type} has ${stats.stale} stale entries (${Math.round((stats.stale / stats.count) * 100)}%). Consider pruning.`
      );
    }

    if (type === "daily" && stats.count > 90) {
      recommendations.push(
        `You have ${stats.count} daily logs. Consider archiving entries older than 90 days.`
      );
    }
  }

  if (recommendations.length === 0) {
    recommendations.push("Memory health looks good!");
  }

  return recommendations;
}

/**
 * Demote stale behavior rules.
 * Rules that haven't been used or confirmed in a while get demoted.
 */
export const demoteStaleBehaviorRules = internalMutation({
  args: {
    teamId: v.string(),
    daysInactive: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const daysInactive = args.daysInactive ?? 60;
    const limit = args.limit ?? 50;
    const now = Date.now();
    const threshold = now - daysInactive * 24 * 60 * 60 * 1000;

    // Find active rules that haven't been used recently
    const staleRules = await ctx.db
      .query("agentBehaviorRules")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "active")
      )
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("lastUsedAt"), undefined),
            q.lt(q.field("lastUsedAt"), threshold)
          ),
          q.or(
            q.eq(q.field("lastConfirmedAt"), undefined),
            q.lt(q.field("lastConfirmedAt"), threshold)
          )
        )
      )
      .take(limit);

    let demoted = 0;
    for (const rule of staleRules) {
      // Calculate stale score
      const daysSinceCreated =
        (now - rule.createdAt) / (1000 * 60 * 60 * 24);
      const daysSinceUsed = rule.lastUsedAt
        ? (now - rule.lastUsedAt) / (1000 * 60 * 60 * 24)
        : daysSinceCreated;

      const staleScore = Math.min(1.0, daysSinceUsed / 90);

      // Demote if stale score is high and low usage
      if (staleScore > 0.7 && rule.timesUsed < 3) {
        await ctx.db.patch(rule._id, {
          status: "archived",
          staleScore,
          updatedAt: now,
        });

        // Log the demotion event
        await ctx.db.insert("agentBehaviorEvents", {
          teamId: args.teamId,
          ruleId: rule._id,
          eventType: "rule_demoted",
          previousStatus: "active",
          newStatus: "archived",
          context: `Auto-demoted due to ${Math.round(daysSinceUsed)} days of inactivity`,
          createdAt: now,
        });

        demoted++;
      }
    }

    return { demoted };
  },
});

/**
 * Emit a context health warning event.
 * Called when an agent's context is approaching limits.
 */
export const emitContextWarning = internalMutation({
  args: {
    orchestrationId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    teamId: v.string(),
    warningType: v.union(
      v.literal("context_near_limit"),
      v.literal("memory_overflow"),
      v.literal("stale_context")
    ),
    currentUsage: v.number(), // Percentage 0-100
    threshold: v.number(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventId = `evt_${now}_${Math.random().toString(36).slice(2, 8)}`;

    await ctx.db.insert("orchestrationEvents", {
      eventId,
      orchestrationId: args.orchestrationId,
      eventType: "context_warning",
      teamId: args.teamId,
      taskRunId: args.taskRunId,
      payload: {
        warningType: args.warningType,
        currentUsage: args.currentUsage,
        threshold: args.threshold,
        message: args.message,
      },
      createdAt: now,
    });

    return { eventId };
  },
});

/**
 * Emit a memory loaded event.
 * Called when memory is seeded into a new sandbox.
 */
export const emitMemoryLoaded = internalMutation({
  args: {
    orchestrationId: v.string(),
    taskRunId: v.id("taskRuns"),
    teamId: v.string(),
    snapshotIds: v.array(v.id("agentMemorySnapshots")),
    totalSize: v.number(), // bytes
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const eventId = `evt_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Record usage for each snapshot
    for (const snapshotId of args.snapshotIds) {
      await ctx.runMutation(internal.agentMemoryFreshness.recordUsage, {
        snapshotId,
      });
    }

    await ctx.db.insert("orchestrationEvents", {
      eventId,
      orchestrationId: args.orchestrationId,
      eventType: "memory_loaded",
      teamId: args.teamId,
      taskRunId: args.taskRunId,
      payload: {
        snapshotCount: args.snapshotIds.length,
        totalSize: args.totalSize,
      },
      createdAt: now,
    });

    return { eventId };
  },
});
