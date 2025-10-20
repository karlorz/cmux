import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

export const get = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("workspaceSettings")
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
    worktreePath: v.optional(v.string()),
    autoPrEnabled: v.optional(v.boolean()),
    crownEvaluatorProvider: v.optional(
      v.union(v.literal("anthropic"), v.literal("openai")),
    ),
    crownEvaluatorModel: v.optional(v.string()),
    crownEvaluatorSystemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .first();
    const now = Date.now();

    const normalizedModel =
      args.crownEvaluatorModel === undefined
        ? undefined
        : args.crownEvaluatorModel.trim() || undefined;
    const normalizedSystemPrompt =
      args.crownEvaluatorSystemPrompt === undefined
        ? undefined
        : args.crownEvaluatorSystemPrompt.trim() || undefined;

    if (existing) {
      await ctx.db.patch(existing._id, {
        worktreePath: args.worktreePath,
        autoPrEnabled: args.autoPrEnabled,
        crownEvaluatorProvider: args.crownEvaluatorProvider,
        crownEvaluatorModel: normalizedModel,
        crownEvaluatorSystemPrompt: normalizedSystemPrompt,
        userId,
        teamId,
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("workspaceSettings", {
        worktreePath: args.worktreePath,
        autoPrEnabled: args.autoPrEnabled,
        crownEvaluatorProvider: args.crownEvaluatorProvider,
        crownEvaluatorModel: normalizedModel,
        crownEvaluatorSystemPrompt: normalizedSystemPrompt,
        createdAt: now,
        updatedAt: now,
        userId,
        teamId,
      });
    }
  },
});

export const getByTeamAndUserInternal = internalQuery({
  args: { teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const settings = await ctx.db
      .query("workspaceSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .first();
    return settings ?? null;
  },
});
