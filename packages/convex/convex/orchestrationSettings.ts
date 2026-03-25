import { v } from "convex/values";
import { internalQuery } from "./_generated/server";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Get orchestration settings for a team.
 * Returns default values if no settings exist.
 */
export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const settings = await ctx.db
      .query("orchestrationSettings")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    // Return settings with defaults
    return {
      teamId,
      autoHeadAgent: settings?.autoHeadAgent ?? false,
      defaultCodingAgent: settings?.defaultCodingAgent ?? "codex/gpt-5.1-codex-mini",
      defaultSupervisorProfileId: settings?.defaultSupervisorProfileId ?? null,
      autoSpawnEnabled: settings?.autoSpawnEnabled ?? false,
      maxConcurrentSubAgents: settings?.maxConcurrentSubAgents ?? 3,
      allowedRepos: settings?.allowedRepos ?? [],
      preferredProviders: settings?.preferredProviders ?? ["codex", "claude"],
      dailyBudgetCents: settings?.dailyBudgetCents ?? null,
      maxTaskDurationMinutes: settings?.maxTaskDurationMinutes ?? 60,
      // /simplify pre-merge gate settings
      requireSimplifyBeforeMerge: settings?.requireSimplifyBeforeMerge ?? false,
      simplifyMode: settings?.simplifyMode ?? "quick",
      simplifyTimeoutMinutes: settings?.simplifyTimeoutMinutes ?? 10,
      createdAt: settings?.createdAt ?? null,
      updatedAt: settings?.updatedAt ?? null,
    };
  },
});

/**
 * Update orchestration settings for a team.
 * Creates settings if they don't exist.
 */
const simplifyModeValidator = v.optional(v.union(
  v.literal("quick"),
  v.literal("full"),
  v.literal("staged-only")
));

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    autoHeadAgent: v.optional(v.boolean()),
    defaultCodingAgent: v.optional(v.string()),
    defaultSupervisorProfileId: v.optional(v.id("supervisorProfiles")),
    autoSpawnEnabled: v.optional(v.boolean()),
    maxConcurrentSubAgents: v.optional(v.number()),
    allowedRepos: v.optional(v.array(v.string())),
    preferredProviders: v.optional(v.array(v.string())),
    dailyBudgetCents: v.optional(v.number()),
    maxTaskDurationMinutes: v.optional(v.number()),
    // /simplify pre-merge gate settings
    requireSimplifyBeforeMerge: v.optional(v.boolean()),
    simplifyMode: simplifyModeValidator,
    simplifyTimeoutMinutes: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("orchestrationSettings")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const now = Date.now();
    const {
      teamSlugOrId: _,
      ...updates
    } = args;

    // Filter out undefined values
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...filteredUpdates,
        updatedAt: now,
      });
      return existing._id;
    } else {
      return await ctx.db.insert("orchestrationSettings", {
        teamId,
        ...filteredUpdates,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

/**
 * Toggle auto head-agent mode.
 * Convenience mutation for the most common setting change.
 */
export const toggleAutoHeadAgent = authMutation({
  args: {
    teamSlugOrId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("orchestrationSettings")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        autoHeadAgent: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("orchestrationSettings", {
        teamId,
        autoHeadAgent: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { enabled: args.enabled };
  },
});

/**
 * Toggle auto-spawn for sub-agents.
 */
export const toggleAutoSpawn = authMutation({
  args: {
    teamSlugOrId: v.string(),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("orchestrationSettings")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        autoSpawnEnabled: args.enabled,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("orchestrationSettings", {
        teamId,
        autoSpawnEnabled: args.enabled,
        createdAt: now,
        updatedAt: now,
      });
    }

    return { enabled: args.enabled };
  },
});

/**
 * Internal query for spawn path to get settings without auth.
 */
export const getByTeamIdInternal = internalQuery({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("orchestrationSettings")
      .withIndex("by_team", (q) => q.eq("teamId", args.teamId))
      .first();

    return {
      autoHeadAgent: settings?.autoHeadAgent ?? false,
      defaultCodingAgent: settings?.defaultCodingAgent ?? "codex/gpt-5.1-codex-mini",
      defaultSupervisorProfileId: settings?.defaultSupervisorProfileId ?? null,
      autoSpawnEnabled: settings?.autoSpawnEnabled ?? false,
      maxConcurrentSubAgents: settings?.maxConcurrentSubAgents ?? 3,
      allowedRepos: settings?.allowedRepos ?? [],
      preferredProviders: settings?.preferredProviders ?? ["codex", "claude"],
      dailyBudgetCents: settings?.dailyBudgetCents ?? null,
      maxTaskDurationMinutes: settings?.maxTaskDurationMinutes ?? 60,
      // /simplify pre-merge gate settings
      requireSimplifyBeforeMerge: settings?.requireSimplifyBeforeMerge ?? false,
      simplifyMode: settings?.simplifyMode ?? "quick",
      simplifyTimeoutMinutes: settings?.simplifyTimeoutMinutes ?? 10,
    };
  },
});
