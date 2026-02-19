import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

function normalizeProjectFullName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("projectFullName is required");
  }
  return trimmed;
}

function normalizeLocalRepoPath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("localRepoPath is required");
  }
  return trimmed;
}

export const list = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const mappings = await ctx.db
      .query("sourceRepoMappings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .collect();

    return mappings.sort((a, b) => b.updatedAt - a.updatedAt);
  },
});

export const getByProject = authQuery({
  args: {
    teamSlugOrId: v.string(),
    projectFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeProjectFullName(args.projectFullName);

    return (
      (await ctx.db
        .query("sourceRepoMappings")
        .withIndex("by_team_user_project", (q) =>
          q
            .eq("teamId", teamId)
            .eq("userId", userId)
            .eq("projectFullName", projectFullName)
        )
        .first()) ?? null
    );
  },
});

export const upsert = authMutation({
  args: {
    teamSlugOrId: v.string(),
    projectFullName: v.string(),
    localRepoPath: v.string(),
    lastVerifiedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();
    const projectFullName = normalizeProjectFullName(args.projectFullName);
    const localRepoPath = normalizeLocalRepoPath(args.localRepoPath);

    const existing = await ctx.db
      .query("sourceRepoMappings")
      .withIndex("by_team_user_project", (q) =>
        q
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("projectFullName", projectFullName)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        localRepoPath,
        lastVerifiedAt: args.lastVerifiedAt ?? existing.lastVerifiedAt,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("sourceRepoMappings", {
      projectFullName,
      localRepoPath,
      lastVerifiedAt: args.lastVerifiedAt,
      createdAt: now,
      updatedAt: now,
      userId,
      teamId,
    });
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    projectFullName: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const projectFullName = normalizeProjectFullName(args.projectFullName);

    const existing = await ctx.db
      .query("sourceRepoMappings")
      .withIndex("by_team_user_project", (q) =>
        q
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("projectFullName", projectFullName)
      )
      .first();

    if (existing) {
      await ctx.db.delete(existing._id);
    }
  },
});
