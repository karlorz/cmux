import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Get per-team hidden model names.
 * Returns hiddenModels array (empty if no visibility overrides exist).
 */
export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const visibility = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    return visibility ?? { hiddenModels: [] };
  },
});

/**
 * Hide or show a single model for the specified team.
 * If hidden=true, adds the model to hiddenModels.
 * If hidden=false, removes the model from hiddenModels.
 */
export const toggleModel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    modelName: v.string(),
    hidden: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

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

    const hiddenModels = new Set(existing?.hiddenModels ?? []);
    const wasHidden = hiddenModels.has(args.modelName);

    if (args.hidden) {
      hiddenModels.add(args.modelName);
    } else {
      hiddenModels.delete(args.modelName);
    }

    const nextHiddenModels = [...hiddenModels];

    if (existing) {
      if (wasHidden !== args.hidden) {
        await ctx.db.patch(existing._id, {
          hiddenModels: nextHiddenModels,
          updatedAt: Date.now(),
          updatedBy: userId,
        });
      }
    } else if (nextHiddenModels.length > 0) {
      const now = Date.now();
      await ctx.db.insert("teamModelVisibility", {
        teamId,
        hiddenModels: nextHiddenModels,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { success: true, hiddenModels: nextHiddenModels };
  },
});
