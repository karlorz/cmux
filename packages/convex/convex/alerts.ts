/**
 * Alerts Convex Module
 *
 * Provides mutations and queries for the observability alerting system.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";

const alertSeverityValidator = v.union(
  v.literal("info"),
  v.literal("warning"),
  v.literal("error"),
  v.literal("critical")
);

const alertCategoryValidator = v.union(
  v.literal("sandbox"),
  v.literal("provider"),
  v.literal("orchestration"),
  v.literal("auth"),
  v.literal("system")
);

/**
 * Create an alert (internal use only)
 */
export const createInternal = internalMutation({
  args: {
    teamId: v.string(),
    alertId: v.string(),
    severity: alertSeverityValidator,
    category: alertCategoryValidator,
    title: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()),
    userId: v.optional(v.string()),
    traceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    return ctx.db.insert("alerts", {
      alertId: args.alertId,
      teamId: args.teamId,
      userId: args.userId,
      severity: args.severity,
      category: args.category,
      title: args.title,
      message: args.message,
      metadata: args.metadata,
      traceId: args.traceId,
      createdAt: now,
    });
  },
});

/**
 * Create an alert (authenticated)
 */
export const create = mutation({
  args: {
    teamSlugOrId: v.string(),
    severity: alertSeverityValidator,
    category: alertCategoryValidator,
    title: v.string(),
    message: v.string(),
    metadata: v.optional(v.any()),
    traceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) throw new Error("Team not found");

    const alertId = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const now = Date.now();

    return ctx.db.insert("alerts", {
      alertId,
      teamId,
      userId: identity.subject,
      severity: args.severity,
      category: args.category,
      title: args.title,
      message: args.message,
      metadata: args.metadata,
      traceId: args.traceId,
      createdAt: now,
    });
  },
});

/**
 * List unresolved alerts for a team
 */
export const listUnresolved = query({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) return [];

    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_team_unresolved", (q) =>
        q.eq("teamId", teamId).eq("resolvedAt", undefined)
      )
      .order("desc")
      .take(args.limit ?? 50);

    return alerts;
  },
});

/**
 * List recent alerts for a team (including resolved)
 */
export const listRecent = query({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
    severity: v.optional(alertSeverityValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) return [];

    let query = ctx.db
      .query("alerts")
      .withIndex("by_team", (q) => q.eq("teamId", teamId));

    const alerts = await query.order("desc").take(args.limit ?? 100);

    // Filter by severity if specified (post-query since we can't combine indices)
    if (args.severity) {
      return alerts.filter((a) => a.severity === args.severity);
    }

    return alerts;
  },
});

/**
 * Acknowledge an alert
 */
export const acknowledge = mutation({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    await ctx.db.patch(args.alertId, {
      acknowledgedAt: Date.now(),
      acknowledgedBy: identity.subject,
    });
  },
});

/**
 * Resolve an alert
 */
export const resolve = mutation({
  args: {
    alertId: v.id("alerts"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const alert = await ctx.db.get(args.alertId);
    if (!alert) throw new Error("Alert not found");

    await ctx.db.patch(args.alertId, {
      resolvedAt: Date.now(),
    });
  },
});

/**
 * Get alert counts by severity for a team (for dashboard)
 */
export const getCountsBySeverity = query({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!teamId) {
      return { info: 0, warning: 0, error: 0, critical: 0 };
    }

    const unresolved = await ctx.db
      .query("alerts")
      .withIndex("by_team_unresolved", (q) =>
        q.eq("teamId", teamId).eq("resolvedAt", undefined)
      )
      .collect();

    const counts = { info: 0, warning: 0, error: 0, critical: 0 };
    for (const alert of unresolved) {
      counts[alert.severity]++;
    }

    return counts;
  },
});

/**
 * Internal query for getting unresolved alerts count
 */
export const getUnresolvedCountInternal = internalQuery({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const alerts = await ctx.db
      .query("alerts")
      .withIndex("by_team_unresolved", (q) =>
        q.eq("teamId", args.teamId).eq("resolvedAt", undefined)
      )
      .collect();

    return alerts.length;
  },
});
