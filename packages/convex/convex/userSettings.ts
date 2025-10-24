import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery, mutation } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

// Default settings
const DEFAULT_SETTINGS = {
  theme: "system" as const,
};

// Get user settings
export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();
    if (!settings) {
      // Return defaults if no settings exist
      return {
        ...DEFAULT_SETTINGS,
        _id: null,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  },
});

// Update user settings
export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    theme: v.optional(v.union(v.literal("dark"), v.literal("light"), v.literal("system"))),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("userSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        ...args,
        userId,
        teamId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("userSettings", {
        ...args,
        userId,
        teamId,
        createdAt: now,
        updatedAt: now,
      });
    }
  },
});

// Get effective settings with defaults
export const getEffective = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();
    return {
      theme: settings?.theme ?? DEFAULT_SETTINGS.theme,
    };
  },
});

// Public query to get current user's settings (for client-side use)
export const getCurrentUserSettings = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();

    return {
      theme: settings?.theme ?? DEFAULT_SETTINGS.theme,
    };
  },
});

// Internal function to get user settings without auth context (for server-side use)
export const getUserSettingsInternal = internalQuery({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("userSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId),
      )
      .first();

    return {
      theme: settings?.theme ?? DEFAULT_SETTINGS.theme,
    };
  },
});