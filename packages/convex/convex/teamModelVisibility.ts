import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Get team-scoped model visibility settings.
 * Returns hiddenModels array for the team (empty if no settings exist).
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
 * Toggle a single model's visibility for the team.
 * If hidden=true, adds to hiddenModels (model will be hidden for this team).
 * If hidden=false, removes from hiddenModels (model will be visible for this team).
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
    const existing = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    const now = Date.now();

    const currentHidden = existing?.hiddenModels ?? [];
    let newHidden: string[];

    if (args.hidden) {
      // Add to hidden list if not already there
      if (currentHidden.includes(args.modelName)) {
        newHidden = currentHidden;
      } else {
        newHidden = [...currentHidden, args.modelName];
      }
    } else {
      // Remove from hidden list (make visible)
      newHidden = currentHidden.filter((name) => name !== args.modelName);
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenModels: newHidden,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("teamModelVisibility", {
        teamId,
        hiddenModels: newHidden,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { success: true, hidden: args.hidden };
  },
});

/**
 * Update the entire hiddenModels array for the team.
 * Useful for bulk operations or admin resets.
 */
export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    hiddenModels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();
    const now = Date.now();

    if (existing) {
      await ctx.db.patch(existing._id, {
        hiddenModels: args.hiddenModels,
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      await ctx.db.insert("teamModelVisibility", {
        teamId,
        hiddenModels: args.hiddenModels,
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { success: true };
  },
});
