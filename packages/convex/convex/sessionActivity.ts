import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { authQuery } from "./users/utils";
import { resolveTeamIdLoose } from "../_shared/team";

// Validators for session activity data
const commitValidator = v.object({
  sha: v.string(),
  message: v.string(),
  timestamp: v.string(),
  filesChanged: v.number(),
  additions: v.number(),
  deletions: v.number(),
});

const prValidator = v.object({
  number: v.number(),
  title: v.string(),
  url: v.string(),
  mergedAt: v.string(),
  additions: v.number(),
  deletions: v.number(),
  filesChanged: v.number(),
});

const fileChangeValidator = v.object({
  path: v.string(),
  additions: v.number(),
  deletions: v.number(),
  status: v.union(
    v.literal("added"),
    v.literal("modified"),
    v.literal("deleted"),
    v.literal("renamed")
  ),
});

/**
 * Record session activity at session start.
 * Called when autopilot or agent session begins.
 */
export const recordSessionStart = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    sessionId: v.string(),
    startCommit: v.string(),
    teamId: v.string(),
  },
  async handler(ctx, args) {
    const now = Date.now();
    const startedAt = new Date().toISOString();

    return await ctx.db.insert("sessionActivity", {
      taskRunId: args.taskRunId,
      sessionId: args.sessionId,
      startedAt,
      startCommit: args.startCommit,
      commits: [],
      prsMerged: [],
      filesChanged: [],
      stats: {
        totalCommits: 0,
        totalPRs: 0,
        totalFiles: 0,
        totalAdditions: 0,
        totalDeletions: 0,
      },
      teamId: args.teamId,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Update session activity at session end.
 * Called when autopilot completes or session wraps up.
 */
export const recordSessionEnd = internalMutation({
  args: {
    sessionActivityId: v.id("sessionActivity"),
    endCommit: v.string(),
    commits: v.array(commitValidator),
    prsMerged: v.array(prValidator),
    filesChanged: v.array(fileChangeValidator),
  },
  async handler(ctx, args) {
    const activity = await ctx.db.get(args.sessionActivityId);
    if (!activity) {
      throw new Error(`Session activity not found: ${args.sessionActivityId}`);
    }

    const now = Date.now();
    const endedAt = new Date().toISOString();
    const startTime = new Date(activity.startedAt).getTime();
    const durationMs = now - startTime;

    // Calculate stats
    const totalAdditions = args.commits.reduce((sum, c) => sum + c.additions, 0);
    const totalDeletions = args.commits.reduce((sum, c) => sum + c.deletions, 0);
    const totalFiles = new Set(args.filesChanged.map((f) => f.path)).size;

    await ctx.db.patch(args.sessionActivityId, {
      endedAt,
      durationMs,
      endCommit: args.endCommit,
      commits: args.commits,
      prsMerged: args.prsMerged,
      filesChanged: args.filesChanged,
      stats: {
        totalCommits: args.commits.length,
        totalPRs: args.prsMerged.length,
        totalFiles,
        totalAdditions,
        totalDeletions,
      },
      updatedAt: now,
    });
  },
});

/**
 * Find session activity by session ID.
 */
export const getBySessionId = internalQuery({
  args: { sessionId: v.string() },
  async handler(ctx, args) {
    return await ctx.db
      .query("sessionActivity")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .first();
  },
});

/**
 * Find session activity by task run ID.
 */
export const getByTaskRunId = internalQuery({
  args: { taskRunId: v.id("taskRuns") },
  async handler(ctx, args) {
    return await ctx.db
      .query("sessionActivity")
      .withIndex("by_taskRun", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();
  },
});

/**
 * List session activity for a team (for dashboard).
 */
export const listByTeam = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
  },
  async handler(ctx, args) {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 20;

    const activities = await ctx.db
      .query("sessionActivity")
      .withIndex("by_team_time", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(limit + 1);

    const hasMore = activities.length > limit;
    const items = hasMore ? activities.slice(0, limit) : activities;
    const nextCursor = hasMore ? items[items.length - 1]?._id : undefined;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Get aggregated stats for a team over a time period.
 */
export const getTeamStats = authQuery({
  args: {
    teamSlugOrId: v.string(),
    days: v.optional(v.number()),
  },
  async handler(ctx, args) {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const days = args.days ?? 7;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const activities = await ctx.db
      .query("sessionActivity")
      .withIndex("by_team_time", (q) => q.eq("teamId", teamId))
      .filter((q) => q.gte(q.field("startedAt"), cutoff))
      .collect();

    const aggregated = activities.reduce(
      (acc, activity) => {
        acc.totalSessions++;
        acc.totalCommits += activity.stats.totalCommits;
        acc.totalPRs += activity.stats.totalPRs;
        acc.totalAdditions += activity.stats.totalAdditions;
        acc.totalDeletions += activity.stats.totalDeletions;
        acc.totalDurationMs += activity.durationMs ?? 0;
        return acc;
      },
      {
        totalSessions: 0,
        totalCommits: 0,
        totalPRs: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        totalDurationMs: 0,
      }
    );

    return {
      ...aggregated,
      periodDays: days,
      avgSessionDurationMs: aggregated.totalSessions > 0
        ? Math.round(aggregated.totalDurationMs / aggregated.totalSessions)
        : 0,
    };
  },
});
