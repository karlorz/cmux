import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Get hidden models for a team.
 */
export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const teamVisibility = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    return {
      hiddenModels: teamVisibility?.hiddenModels ?? [],
    };
  },
});

/**
 * Toggle model visibility for a team.
 * hidden=true adds model to hiddenModels, hidden=false removes it.
 */
export const toggleModel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelName: v.string(),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const model = await ctx.db
      .query("models")
      .withIndex("by_name", (q) => q.eq("name", args.modelName))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.modelName}`);
    }

    const existing = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const currentHidden = existing?.hiddenModels ?? [];
    const hiddenSet = new Set(currentHidden);

    if (args.hidden) {
      hiddenSet.add(args.modelName);
    } else {
      hiddenSet.delete(args.modelName);
    }

    const hiddenModels = Array.from(hiddenSet);

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenModels,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("teamModelVisibility", {
        teamId,
        hiddenModels,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { success: true, hiddenModels };
  },
});
