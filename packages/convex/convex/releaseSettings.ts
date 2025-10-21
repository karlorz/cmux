import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const settings = await ctx.db
      .query("releaseSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();

    return settings ?? null;
  },
});

export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    alwaysUseLatestRelease: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    const existing = await ctx.db
      .query("releaseSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        alwaysUseLatestRelease: args.alwaysUseLatestRelease,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("releaseSettings", {
      alwaysUseLatestRelease: args.alwaysUseLatestRelease,
      createdAt: now,
      updatedAt: now,
      userId,
      teamId,
    });
  },
});
