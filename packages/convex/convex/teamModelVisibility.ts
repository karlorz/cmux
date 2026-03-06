import { v } from "convex/values";
import { authMutation, authQuery } from "./users/utils";
import { resolveTeamIdLoose } from "../_shared/team";

/**
 * Get team's hidden models.
 * Returns the list of model names that are hidden for this team.
 */
export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const visibility = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    return {
      teamId,
      hiddenModels: visibility?.hiddenModels ?? [],
      updatedAt: visibility?.updatedAt,
      updatedBy: visibility?.updatedBy,
    };
  },
});

/**
 * Toggle visibility of a model for a specific team.
 * Hidden models are stored in teamModelVisibility.hiddenModels array.
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

    // Verify the model exists in the system
    const model = await ctx.db
      .query("models")
      .withIndex("by_name", (q) => q.eq("name", args.modelName))
      .first();

    if (!model) {
      throw new Error(`Model not found: ${args.modelName}`);
    }

    // Get existing visibility record for this team
    const existing = await ctx.db
      .query("teamModelVisibility")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .first();

    const now = Date.now();

    if (existing) {
      // Update existing record
      const currentHidden = new Set(existing.hiddenModels);

      if (args.hidden) {
        currentHidden.add(args.modelName);
      } else {
        currentHidden.delete(args.modelName);
      }

      await ctx.db.patch(existing._id, {
        hiddenModels: Array.from(currentHidden),
        updatedAt: now,
        updatedBy: userId,
      });
    } else {
      // Create new record
      await ctx.db.insert("teamModelVisibility", {
        teamId,
        hiddenModels: args.hidden ? [args.modelName] : [],
        createdAt: now,
        updatedAt: now,
        updatedBy: userId,
      });
    }

    return { success: true };
  },
});

/**
 * Bulk update visibility for multiple models at once.
 * Useful for batch operations or initializing team settings.
 */
export const setHiddenModels = authMutation({
  args: {
    teamSlugOrId: v.string(),
    hiddenModels: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

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
