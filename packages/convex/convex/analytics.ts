import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import { authQuery } from "./users/utils";

/**
 * Bucket an array of timestamps into 7 daily counts.
 * Returns an array of length 7 where index 0 = 6 days ago, index 6 = today.
 */
function bucketByDay(timestamps: number[]): number[] {
  const days = new Array<number>(7).fill(0);
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  for (const ts of timestamps) {
    const dayIndex = Math.floor((startOfToday - ts) / (24 * 60 * 60 * 1000));
    // dayIndex 0 = today, 1 = yesterday, ... 6 = 6 days ago
    // We want array index 0 = oldest, 6 = today
    if (dayIndex >= 0 && dayIndex < 7) {
      days[6 - dayIndex] += 1;
    }
  }
  return days;
}

/**
 * Get token usage analytics grouped by task class.
 * Enables cost optimization by showing which task classes consume the most tokens.
 */
export const getTokenUsageByTaskClass = authQuery({
  args: {
    teamSlugOrId: v.string(),
    /** Number of days to look back (default 7) */
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const days = args.days ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    // Fetch completed runs with context usage in the time range
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user_status_created", (idx) =>
        idx
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("status", "completed")
          .gte("createdAt", cutoff)
      )
      .collect();

    // Aggregate by task class
    const byTaskClass = new Map<
      string,
      {
        runCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        avgInputTokens: number;
        avgOutputTokens: number;
      }
    >();

    for (const run of runs) {
      const taskClass = run.taskClass ?? "unclassified";
      const usage = run.contextUsage;

      const existing = byTaskClass.get(taskClass) ?? {
        runCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        avgInputTokens: 0,
        avgOutputTokens: 0,
      };

      existing.runCount += 1;
      if (usage) {
        existing.totalInputTokens += usage.totalInputTokens;
        existing.totalOutputTokens += usage.totalOutputTokens;
      }

      byTaskClass.set(taskClass, existing);
    }

    // Calculate averages
    const result: Record<
      string,
      {
        runCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        avgInputTokens: number;
        avgOutputTokens: number;
      }
    > = {};

    for (const [taskClass, data] of byTaskClass) {
      result[taskClass] = {
        ...data,
        avgInputTokens:
          data.runCount > 0
            ? Math.round(data.totalInputTokens / data.runCount)
            : 0,
        avgOutputTokens:
          data.runCount > 0
            ? Math.round(data.totalOutputTokens / data.runCount)
            : 0,
      };
    }

    return {
      byTaskClass: result,
      totalRuns: runs.length,
      period: { days, cutoff },
    };
  },
});

/**
 * Get token usage analytics grouped by agent/model.
 * Enables cost optimization by showing which models consume the most tokens.
 */
export const getTokenUsageByAgent = authQuery({
  args: {
    teamSlugOrId: v.string(),
    days: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const days = args.days ?? 7;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user_status_created", (idx) =>
        idx
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("status", "completed")
          .gte("createdAt", cutoff)
      )
      .collect();

    // Aggregate by agent name
    const byAgent = new Map<
      string,
      {
        runCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        taskClassBreakdown: Record<string, number>;
      }
    >();

    for (const run of runs) {
      const agentName = run.agentName ?? "unknown";
      const taskClass = run.taskClass ?? "unclassified";
      const usage = run.contextUsage;

      const existing = byAgent.get(agentName) ?? {
        runCount: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        taskClassBreakdown: {},
      };

      existing.runCount += 1;
      if (usage) {
        existing.totalInputTokens += usage.totalInputTokens;
        existing.totalOutputTokens += usage.totalOutputTokens;
      }
      existing.taskClassBreakdown[taskClass] =
        (existing.taskClassBreakdown[taskClass] ?? 0) + 1;

      byAgent.set(agentName, existing);
    }

    const result: Record<
      string,
      {
        runCount: number;
        totalInputTokens: number;
        totalOutputTokens: number;
        avgInputTokens: number;
        avgOutputTokens: number;
        taskClassBreakdown: Record<string, number>;
      }
    > = {};

    for (const [agentName, data] of byAgent) {
      result[agentName] = {
        ...data,
        avgInputTokens:
          data.runCount > 0
            ? Math.round(data.totalInputTokens / data.runCount)
            : 0,
        avgOutputTokens:
          data.runCount > 0
            ? Math.round(data.totalOutputTokens / data.runCount)
            : 0,
      };
    }

    return {
      byAgent: result,
      totalRuns: runs.length,
      period: { days, cutoff },
    };
  },
});

export const getDashboardStats = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Fetch tasks created in the past 7 days (filter by date at index level)
    const recentTasksRaw = await ctx.db
      .query("tasks")
      .withIndex("by_team_user_created", (idx) =>
        idx
          .eq("teamId", teamId)
          .eq("userId", userId)
          .gte("createdAt", sevenDaysAgo),
      )
      .collect();

    // Exclude workspaces and previews in memory
    const recentTasks = recentTasksRaw.filter(
      (t) => !t.isCloudWorkspace && !t.isLocalWorkspace && !t.isPreview,
    );

    // Fetch only merged tasks updated in the past 7 days
    const mergedTasks = await ctx.db
      .query("tasks")
      .withIndex("by_team_user_merge_updated", (idx) =>
        idx
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("mergeStatus", "pr_merged")
          .gte("updatedAt", sevenDaysAgo),
      )
      .collect();

    // Fetch only completed task runs created in the past 7 days
    const completedRuns = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user_status_created", (idx) =>
        idx
          .eq("teamId", teamId)
          .eq("userId", userId)
          .eq("status", "completed")
          .gte("createdAt", sevenDaysAgo),
      )
      .collect();

    return {
      tasksStarted: {
        total: recentTasks.length,
        daily: bucketByDay(
          recentTasks.map((t) => t.createdAt ?? t._creationTime),
        ),
      },
      tasksMerged: {
        total: mergedTasks.length,
        daily: bucketByDay(
          mergedTasks.map((t) => t.updatedAt ?? t._creationTime),
        ),
      },
      runsCompleted: {
        total: completedRuns.length,
        daily: bucketByDay(
          completedRuns.map((r) => r.completedAt ?? r.updatedAt),
        ),
      },
    };
  },
});
