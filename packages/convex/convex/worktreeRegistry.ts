import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { resolveTeamIdLoose } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

/**
 * Worktree registry for tracking active worktrees.
 * Used by the settings page to list and manage worktrees.
 */

export const list = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    return await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .collect();
  },
});

export const getByPath = authQuery({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const result = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();

    // Ensure the result belongs to this team/user
    if (result && result.teamId === teamId && result.userId === userId) {
      return result;
    }
    return null;
  },
});

export const register = authMutation({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.string(),
    sourceRepoPath: v.string(),
    projectFullName: v.string(),
    branchName: v.string(),
    shortId: v.string(),
    mode: v.union(v.literal("legacy"), v.literal("codex-style")),
    taskRunId: v.optional(v.id("taskRuns")),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    // Check if worktree already registered
    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();

    if (existing) {
      // Only update if the existing entry belongs to this team/user
      if (existing.teamId === teamId && existing.userId === userId) {
        const updates: {
          lastUsedAt: number;
          taskRunIds?: Id<"taskRuns">[];
        } = { lastUsedAt: now };

        if (args.taskRunId) {
          const existingTaskRunIds = existing.taskRunIds || [];
          if (!existingTaskRunIds.includes(args.taskRunId)) {
            updates.taskRunIds = [...existingTaskRunIds, args.taskRunId];
          }
        }

        await ctx.db.patch(existing._id, updates);
        return existing._id;
      }
      // If path exists but belongs to different user/team, throw error
      // (worktree paths should be unique per user)
      throw new Error(
        `Worktree path ${args.worktreePath} is already registered by another user`
      );
    }

    // Create new entry
    return await ctx.db.insert("worktreeRegistry", {
      worktreePath: args.worktreePath,
      sourceRepoPath: args.sourceRepoPath,
      projectFullName: args.projectFullName,
      branchName: args.branchName,
      shortId: args.shortId,
      mode: args.mode,
      taskRunIds: args.taskRunId ? [args.taskRunId] : undefined,
      lastUsedAt: now,
      createdAt: now,
      userId,
      teamId,
    });
  },
});

export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();

    // Only delete if belongs to this team/user
    if (existing && existing.teamId === teamId && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
  },
});

export const updateLastUsed = authMutation({
  args: {
    teamSlugOrId: v.string(),
    worktreePath: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();

    if (existing && existing.teamId === teamId && existing.userId === userId) {
      await ctx.db.patch(existing._id, { lastUsedAt: now });
    }
  },
});

// Internal queries/mutations for use by backend services

export const getByPathInternal = internalQuery({
  args: { worktreePath: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();
  },
});

export const registerInternal = internalMutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    worktreePath: v.string(),
    sourceRepoPath: v.string(),
    projectFullName: v.string(),
    branchName: v.string(),
    shortId: v.string(),
    mode: v.union(v.literal("legacy"), v.literal("codex-style")),
    taskRunId: v.optional(v.id("taskRuns")),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check if worktree already registered
    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) =>
        q.eq("worktreePath", args.worktreePath)
      )
      .first();

    if (existing) {
      // Only update if the existing entry belongs to this team/user
      if (existing.teamId === args.teamId && existing.userId === args.userId) {
        const updates: {
          lastUsedAt: number;
          taskRunIds?: Id<"taskRuns">[];
        } = { lastUsedAt: now };

        if (args.taskRunId) {
          const existingTaskRunIds = existing.taskRunIds || [];
          if (!existingTaskRunIds.includes(args.taskRunId)) {
            updates.taskRunIds = [...existingTaskRunIds, args.taskRunId];
          }
        }

        await ctx.db.patch(existing._id, updates);
        return existing._id;
      }
      // If path exists but belongs to different user/team, throw error
      throw new Error(
        `Worktree path ${args.worktreePath} is already registered by another user`
      );
    }

    return await ctx.db.insert("worktreeRegistry", {
      worktreePath: args.worktreePath,
      sourceRepoPath: args.sourceRepoPath,
      projectFullName: args.projectFullName,
      branchName: args.branchName,
      shortId: args.shortId,
      mode: args.mode,
      taskRunIds: args.taskRunId ? [args.taskRunId] : undefined,
      lastUsedAt: now,
      createdAt: now,
      userId: args.userId,
      teamId: args.teamId,
    });
  },
});
