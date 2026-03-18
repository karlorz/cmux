import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

const reasoningLevelValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

const reviewPostureValidator = v.union(
  v.literal("permissive"),
  v.literal("balanced"),
  v.literal("strict")
);

const delegationStyleValidator = v.union(
  v.literal("parallel"),
  v.literal("sequential"),
  v.literal("adaptive")
);

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await ctx.db
      .query("supervisorProfiles")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .take(100);
  },
});

export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    profileId: v.id("supervisorProfiles"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const profile = await ctx.db.get(args.profileId);
    if (!profile || profile.teamId !== teamId) return null;
    return profile;
  },
});

export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    model: v.string(),
    reasoningLevel: reasoningLevelValidator,
    reviewPosture: reviewPostureValidator,
    delegationStyle: delegationStyleValidator,
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();
    return await ctx.db.insert("supervisorProfiles", {
      name: args.name,
      description: args.description,
      model: args.model,
      reasoningLevel: args.reasoningLevel,
      reviewPosture: args.reviewPosture,
      delegationStyle: args.delegationStyle,
      userId,
      teamId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    profileId: v.id("supervisorProfiles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    model: v.optional(v.string()),
    reasoningLevel: v.optional(reasoningLevelValidator),
    reviewPosture: v.optional(reviewPostureValidator),
    delegationStyle: v.optional(delegationStyleValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const { profileId, teamSlugOrId: _, ...updates } = args;
    const existing = await ctx.db.get(profileId);
    if (!existing || existing.teamId !== teamId) {
      throw new Error("Profile not found");
    }

    const filtered = Object.fromEntries(
      Object.entries(updates).filter(([, v]) => v !== undefined)
    );

    await ctx.db.patch(profileId, {
      ...filtered,
      updatedAt: Date.now(),
    });
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    profileId: v.id("supervisorProfiles"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db.get(args.profileId);
    if (!existing || existing.teamId !== teamId) {
      throw new Error("Profile not found");
    }
    await ctx.db.delete(args.profileId);
  },
});

/**
 * Internal query to get a supervisor profile by ID.
 * Used by the orchestration worker to read profile settings during spawn.
 */
export const getByIdInternal = internalQuery({
  args: {
    profileId: v.id("supervisorProfiles"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.profileId);
  },
});
