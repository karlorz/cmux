import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import type { Id } from "./_generated/dataModel";
import { authMutation, authQuery } from "./users/utils";

export const getByFullName = authQuery({
  args: {
    teamSlugOrId: v.string(),
    fullName: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await ctx.db
      .query("repos")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .filter((q) => q.eq(q.field("fullName"), args.fullName))
      .first();
  },
});

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await ctx.db
      .query("repos")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .collect();
  },
});

export const updateDefaultEnvironment = authMutation({
  args: {
    teamSlugOrId: v.string(),
    repoId: v.id("repos"),
    environmentId: v.union(v.id("environments"), v.null()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    if (!userId) {
      throw new Error("Authentication required");
    }

    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const repo = await ctx.db.get(args.repoId);

    if (!repo || repo.teamId !== teamId) {
      throw new Error("Repository not found or unauthorized");
    }

    // Verify environment belongs to same team if not null
    if (args.environmentId) {
      const environment = await ctx.db.get(args.environmentId);
      if (!environment || environment.teamId !== teamId) {
        throw new Error("Environment not found or unauthorized");
      }
    }

    await ctx.db.patch(args.repoId, {
      defaultEnvironmentId: args.environmentId ?? undefined,
    });

    return args.repoId;
  },
});
