import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    provider: v.union(v.literal("github"), v.literal("gitlab"), v.literal("bitbucket")),
    repoUrl: v.string(),
    defaultBranch: v.string(),
    dataVaultKey: v.string(),
    description: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const now = Date.now();
    const repositoryId = await ctx.db.insert("cloudRepositories", {
      name: args.name,
      teamId,
      userId,
      provider: args.provider,
      repoUrl: args.repoUrl,
      defaultBranch: args.defaultBranch,
      dataVaultKey: args.dataVaultKey,
      description: args.description,
      isPrivate: args.isPrivate,
      createdAt: now,
      updatedAt: now,
    });

    return { repositoryId };
  },
});

export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("cloudRepositories"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const repository = await ctx.db.get(args.id);

    if (!repository || repository.teamId !== teamId) {
      return null;
    }

    return repository;
  },
});

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const repositories = await ctx.db
      .query("cloudRepositories")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .order("desc")
      .collect();

    return repositories;
  },
});

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("cloudRepositories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    defaultBranch: v.optional(v.string()),
    isPrivate: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const repository = await ctx.db.get(args.id);

    if (!repository || repository.teamId !== teamId) {
      throw new Error("Cloud repository not found");
    }

    const updates: Partial<typeof repository> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.defaultBranch !== undefined) updates.defaultBranch = args.defaultBranch;
    if (args.isPrivate !== undefined) updates.isPrivate = args.isPrivate;

    await ctx.db.patch(args.id, updates);

    return { success: true };
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("cloudRepositories"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const repository = await ctx.db.get(args.id);

    if (!repository || repository.teamId !== teamId) {
      throw new Error("Cloud repository not found");
    }

    await ctx.db.delete(args.id);

    return { success: true };
  },
});

export const syncRepository = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("cloudRepositories"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const repository = await ctx.db.get(args.id);

    if (!repository || repository.teamId !== teamId) {
      throw new Error("Cloud repository not found");
    }

    await ctx.db.patch(args.id, {
      lastSynced: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});