import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import type { Id } from "./_generated/dataModel";
import { authMutation, authQuery } from "./users/utils";

function normalizePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("worktreePath is required");
  }
  return trimmed;
}

function mergeTaskRunIds(
  existing: Id<"taskRuns">[] | undefined,
  taskRunId: Id<"taskRuns"> | undefined
): Id<"taskRuns">[] | undefined {
  if (!taskRunId) {
    return existing;
  }
  const next = new Set(existing ?? []);
  next.add(taskRunId);
  return Array.from(next);
}

export const list = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const worktrees = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      )
      .collect();

    return worktrees.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
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
    const worktreePath = normalizePath(args.worktreePath);

    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) => q.eq("worktreePath", worktreePath))
      .first();

    if (!existing || existing.teamId !== teamId || existing.userId !== userId) {
      return null;
    }

    return existing;
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
    const worktreePath = normalizePath(args.worktreePath);

    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) => q.eq("worktreePath", worktreePath))
      .first();

    if (existing) {
      if (existing.teamId !== teamId || existing.userId !== userId) {
        throw new Error("Worktree path is already registered by another user");
      }

      await ctx.db.patch(existing._id, {
        sourceRepoPath: args.sourceRepoPath,
        projectFullName: args.projectFullName,
        branchName: args.branchName,
        shortId: args.shortId,
        mode: args.mode,
        taskRunIds: mergeTaskRunIds(existing.taskRunIds, args.taskRunId),
        lastUsedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("worktreeRegistry", {
      worktreePath,
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
    const worktreePath = normalizePath(args.worktreePath);

    const existing = await ctx.db
      .query("worktreeRegistry")
      .withIndex("by_worktree_path", (q) => q.eq("worktreePath", worktreePath))
      .first();

    if (existing && existing.teamId === teamId && existing.userId === userId) {
      await ctx.db.delete(existing._id);
    }
  },
});
