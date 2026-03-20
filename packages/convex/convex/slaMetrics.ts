/**
 * SLA Metrics Convex Module
 *
 * Tracks and queries SLA metrics for observability.
 */

import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";

/**
 * Record an SLA metric (internal use only)
 */
export const record = internalMutation({
  args: {
    teamId: v.string(),
    metricName: v.string(),
    value: v.number(),
    unit: v.string(),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("slaMetrics", {
      teamId: args.teamId,
      metricName: args.metricName,
      value: args.value,
      unit: args.unit,
      timestamp: now,
      metadata: args.metadata,
    });
  },
});

/**
 * Get the latest SLA metrics for a team
 */
export const getLatest = query({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) return null;

    // Get latest metric for each key metric type
    const metricNames = [
      "sandbox_spawn_p95",
      "task_completion_rate",
      "provider_uptime",
    ];

    const results: Record<string, number> & { timestamp?: number } = {};
    let latestTimestamp = 0;

    for (const metricName of metricNames) {
      const latest = await ctx.db
        .query("slaMetrics")
        .withIndex("by_team_metric_time", (q) =>
          q.eq("teamId", teamId).eq("metricName", metricName)
        )
        .order("desc")
        .first();

      if (latest) {
        results[metricName] = latest.value;
        if (latest.timestamp > latestTimestamp) {
          latestTimestamp = latest.timestamp;
        }
      }
    }

    if (latestTimestamp > 0) {
      results.timestamp = latestTimestamp;
    }

    return results;
  },
});

/**
 * Get historical metrics for a team (for charts)
 */
export const getHistory = query({
  args: {
    teamSlugOrId: v.string(),
    metricName: v.string(),
    daysBack: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) return [];

    const daysBack = args.daysBack ?? 7;
    const startTime = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const metrics = await ctx.db
      .query("slaMetrics")
      .withIndex("by_team_metric_time", (q) =>
        q.eq("teamId", teamId).eq("metricName", args.metricName)
      )
      .filter((q) => q.gte(q.field("timestamp"), startTime))
      .order("asc")
      .collect();

    return metrics.map((m) => ({
      value: m.value,
      timestamp: m.timestamp,
    }));
  },
});
