import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await ctx.db
      .query("supervisorProfiles")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  },
});

export const get = authQuery({
  args: {
    profileId: v.id("supervisorProfiles"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.profileId);
  },
});

export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    model: v.string(),
    reasoningLevel: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high")
    ),
    reviewPosture: v.union(
      v.literal("permissive"),
      v.literal("balanced"),
      v.literal("strict")
    ),
    delegationStyle: v.union(
      v.literal("parallel"),
      v.literal("sequential"),
      v.literal("adaptive")
    ),
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
    profileId: v.id("supervisorProfiles"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    model: v.optional(v.string()),
    reasoningLevel: v.optional(
      v.union(
        v.literal("low"),
        v.literal("medium"),
        v.literal("high")
      )
    ),
    reviewPosture: v.optional(
      v.union(
        v.literal("permissive"),
        v.literal("balanced"),
        v.literal("strict")
      )
    ),
    delegationStyle: v.optional(
      v.union(
        v.literal("parallel"),
        v.literal("sequential"),
        v.literal("adaptive")
      )
    ),
  },
  handler: async (ctx, args) => {
    const { profileId, ...updates } = args;
    const existing = await ctx.db.get(profileId);
    if (!existing) throw new Error("Profile not found");

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
    profileId: v.id("supervisorProfiles"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.profileId);
  },
});
