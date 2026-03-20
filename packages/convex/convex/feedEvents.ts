import { v } from "convex/values";
import { query, internalMutation } from "./_generated/server";

// Query feed events for a team
export const list = query({
  args: {
    teamId: v.string(),
    eventType: v.optional(
      v.union(
        v.literal("task_completed"),
        v.literal("task_failed"),
        v.literal("pr_merged"),
        v.literal("pr_opened"),
        v.literal("pr_closed"),
        v.literal("agent_started"),
        v.literal("agent_error"),
        v.literal("approval_required"),
        v.literal("approval_resolved"),
        v.literal("milestone_completed"),
        v.literal("project_created"),
        v.literal("orchestration_completed")
      )
    ),
    repoFullName: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.number()), // createdAt timestamp for pagination
  },
  handler: async (ctx, args) => {
    const { teamId, eventType, repoFullName, limit = 50, cursor } = args;

    let query;

    if (eventType) {
      query = ctx.db
        .query("feedEvents")
        .withIndex("by_team_type", (q) =>
          cursor
            ? q.eq("teamId", teamId).eq("eventType", eventType).lt("createdAt", cursor)
            : q.eq("teamId", teamId).eq("eventType", eventType)
        );
    } else if (repoFullName) {
      query = ctx.db
        .query("feedEvents")
        .withIndex("by_team_repo", (q) =>
          cursor
            ? q.eq("teamId", teamId).eq("repoFullName", repoFullName).lt("createdAt", cursor)
            : q.eq("teamId", teamId).eq("repoFullName", repoFullName)
        );
    } else {
      query = ctx.db
        .query("feedEvents")
        .withIndex("by_team", (q) =>
          cursor
            ? q.eq("teamId", teamId).lt("createdAt", cursor)
            : q.eq("teamId", teamId)
        );
    }

    const events = await query.order("desc").take(limit + 1);

    const hasMore = events.length > limit;
    const items = hasMore ? events.slice(0, -1) : events;
    const nextCursor = hasMore && items.length > 0 ? items[items.length - 1].createdAt : undefined;

    return {
      items,
      nextCursor,
      hasMore,
    };
  },
});

// Get event counts by type (for filtering UI)
export const countsByType = query({
  args: {
    teamId: v.string(),
    since: v.optional(v.number()), // Only count events since this timestamp
  },
  handler: async (ctx, args) => {
    const { teamId, since } = args;

    const events = await ctx.db
      .query("feedEvents")
      .withIndex("by_team", (q) =>
        since
          ? q.eq("teamId", teamId).gte("createdAt", since)
          : q.eq("teamId", teamId)
      )
      .collect();

    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    }

    return counts;
  },
});

// Create a feed event (internal use)
export const create = internalMutation({
  args: {
    teamId: v.string(),
    userId: v.optional(v.string()),
    eventType: v.union(
      v.literal("task_completed"),
      v.literal("task_failed"),
      v.literal("pr_merged"),
      v.literal("pr_opened"),
      v.literal("pr_closed"),
      v.literal("agent_started"),
      v.literal("agent_error"),
      v.literal("approval_required"),
      v.literal("approval_resolved"),
      v.literal("milestone_completed"),
      v.literal("project_created"),
      v.literal("orchestration_completed")
    ),
    title: v.string(),
    description: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    projectId: v.optional(v.id("projects")),
    orchestrationTaskId: v.optional(v.id("orchestrationTasks")),
    agentName: v.optional(v.string()),
    repoFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    return await ctx.db.insert("feedEvents", {
      ...args,
      createdAt: now,
    });
  },
});

// Delete old feed events (cleanup, internal use)
export const deleteOldEvents = internalMutation({
  args: {
    teamId: v.string(),
    olderThan: v.number(), // Delete events older than this timestamp
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { teamId, olderThan, limit = 100 } = args;

    const oldEvents = await ctx.db
      .query("feedEvents")
      .withIndex("by_team", (q) => q.eq("teamId", teamId).lt("createdAt", olderThan))
      .order("asc")
      .take(limit);

    let deleted = 0;
    for (const event of oldEvents) {
      await ctx.db.delete(event._id);
      deleted++;
    }

    return { deleted, remaining: oldEvents.length === limit };
  },
});
