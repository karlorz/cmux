/**
 * Orchestration Queries and Mutations
 *
 * Provides data access for multi-agent orchestration:
 * - Task queue management (create, assign, complete)
 * - Provider health tracking
 * - Dependency resolution
 */

import { v } from "convex/values";
import { query, mutation } from "./_generated/server";

// ============================================================================
// Orchestration Task Queries
// ============================================================================

/**
 * Get all pending tasks for a team, sorted by priority.
 */
export const listPendingTasks = query({
  args: {
    teamId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { teamId, limit = 50 }) => {
    return ctx.db
      .query("orchestrationTasks")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "pending")
      )
      .order("asc")
      .take(limit);
  },
});

/**
 * Get recent tasks for a team, optionally filtered by status.
 * Returns tasks ordered by updatedAt desc.
 */
export const listTasksByTeam = query({
  args: {
    teamId: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("assigned"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { teamId, status, limit = 50 }) => {
    if (status) {
      // Use the by_team_status index when filtering by status
      const tasks = await ctx.db
        .query("orchestrationTasks")
        .withIndex("by_team_status", (q) =>
          q.eq("teamId", teamId).eq("status", status)
        )
        .collect();

      // Sort by updatedAt desc and take limit
      return tasks
        .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
        .slice(0, limit);
    }

    // Without status filter, query all tasks for team and sort by updatedAt
    const tasks = await ctx.db
      .query("orchestrationTasks")
      .withIndex("by_team_status", (q) => q.eq("teamId", teamId))
      .collect();

    return tasks
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
      .slice(0, limit);
  },
});

/**
 * Get tasks assigned to a specific agent.
 */
export const listAgentTasks = query({
  args: {
    agentName: v.string(),
    status: v.optional(
      v.union(
        v.literal("pending"),
        v.literal("assigned"),
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, { agentName, status }) => {
    let q = ctx.db
      .query("orchestrationTasks")
      .withIndex("by_assigned_agent", (q) => q.eq("assignedAgentName", agentName));

    if (status) {
      q = q.filter((q) => q.eq(q.field("status"), status));
    }

    return q.collect();
  },
});

/**
 * Get a single orchestration task by ID.
 */
export const getTask = query({
  args: {
    taskId: v.id("orchestrationTasks"),
  },
  handler: async (ctx, { taskId }) => {
    return ctx.db.get(taskId);
  },
});

/**
 * Get tasks that are blocked by a specific task.
 */
export const getDependentTasks = query({
  args: {
    taskId: v.id("orchestrationTasks"),
  },
  handler: async (ctx, { taskId }) => {
    const task = await ctx.db.get(taskId);
    if (!task?.dependents) return [];

    const dependents = await Promise.all(
      task.dependents.map((id) => ctx.db.get(id))
    );

    return dependents.filter(Boolean);
  },
});

/**
 * Get ready-to-execute tasks (no unresolved dependencies).
 */
export const getReadyTasks = query({
  args: {
    teamId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { teamId, limit = 10 }) => {
    const pendingTasks = await ctx.db
      .query("orchestrationTasks")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "pending")
      )
      .order("asc")
      .take(100);

    // Filter to tasks with no dependencies or all dependencies completed
    const readyTasks = [];
    for (const task of pendingTasks) {
      if (!task.dependencies || task.dependencies.length === 0) {
        readyTasks.push(task);
        continue;
      }

      // Check if all dependencies are completed
      const deps = await Promise.all(
        task.dependencies.map((id) => ctx.db.get(id))
      );
      const allCompleted = deps.every(
        (dep) => dep?.status === "completed"
      );

      if (allCompleted) {
        readyTasks.push(task);
      }

      if (readyTasks.length >= limit) break;
    }

    return readyTasks;
  },
});

// ============================================================================
// Orchestration Task Mutations
// ============================================================================

/**
 * Create a new orchestration task.
 */
export const createTask = mutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    prompt: v.string(),
    priority: v.optional(v.number()),
    dependencies: v.optional(v.array(v.id("orchestrationTasks"))),
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    parentTaskId: v.optional(v.id("orchestrationTasks")),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const taskId = await ctx.db.insert("orchestrationTasks", {
      teamId: args.teamId,
      userId: args.userId,
      prompt: args.prompt,
      priority: args.priority ?? 5,
      status: "pending",
      dependencies: args.dependencies,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      parentTaskId: args.parentTaskId,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });

    // Update dependent tasks to track this dependency
    if (args.dependencies) {
      for (const depId of args.dependencies) {
        const dep = await ctx.db.get(depId);
        if (dep) {
          await ctx.db.patch(depId, {
            dependents: [...(dep.dependents ?? []), taskId],
            updatedAt: now,
          });
        }
      }
    }

    return taskId;
  },
});

/**
 * Assign a task to an agent.
 */
export const assignTask = mutation({
  args: {
    taskId: v.id("orchestrationTasks"),
    agentName: v.string(),
    sandboxId: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, agentName, sandboxId }) => {
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "assigned",
      assignedAgentName: agentName,
      assignedSandboxId: sandboxId,
      assignedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a task as running.
 */
export const startTask = mutation({
  args: {
    taskId: v.id("orchestrationTasks"),
  },
  handler: async (ctx, { taskId }) => {
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "running",
      startedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Complete a task successfully.
 */
export const completeTask = mutation({
  args: {
    taskId: v.id("orchestrationTasks"),
    result: v.optional(v.string()),
  },
  handler: async (ctx, { taskId, result }) => {
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "completed",
      result,
      completedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Mark a task as failed.
 */
export const failTask = mutation({
  args: {
    taskId: v.id("orchestrationTasks"),
    errorMessage: v.string(),
  },
  handler: async (ctx, { taskId, errorMessage }) => {
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "failed",
      errorMessage,
      completedAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Cancel a task.
 */
export const cancelTask = mutation({
  args: {
    taskId: v.id("orchestrationTasks"),
  },
  handler: async (ctx, { taskId }) => {
    const now = Date.now();
    await ctx.db.patch(taskId, {
      status: "cancelled",
      completedAt: now,
      updatedAt: now,
    });
  },
});

// ============================================================================
// Provider Health Queries
// ============================================================================

/**
 * Get health status for a provider.
 */
export const getProviderHealth = query({
  args: {
    providerId: v.string(),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, { providerId, teamId }) => {
    // Try team-specific health first
    if (teamId) {
      const teamHealth = await ctx.db
        .query("providerHealth")
        .withIndex("by_team_provider", (q) =>
          q.eq("teamId", teamId).eq("providerId", providerId)
        )
        .first();
      if (teamHealth) return teamHealth;
    }

    // Fall back to global health
    return ctx.db
      .query("providerHealth")
      .withIndex("by_provider", (q) => q.eq("providerId", providerId))
      .filter((q) => q.eq(q.field("teamId"), undefined))
      .first();
  },
});

/**
 * List all provider health statuses.
 */
export const listProviderHealth = query({
  args: {
    teamId: v.optional(v.string()),
    statusFilter: v.optional(
      v.union(
        v.literal("healthy"),
        v.literal("degraded"),
        v.literal("unhealthy")
      )
    ),
  },
  handler: async (ctx, { teamId, statusFilter }) => {
    let results;

    if (statusFilter) {
      results = await ctx.db
        .query("providerHealth")
        .withIndex("by_status", (q) => q.eq("status", statusFilter))
        .order("desc")
        .collect();
    } else {
      results = await ctx.db.query("providerHealth").collect();
    }

    // Filter by team if specified
    if (teamId) {
      return results.filter(
        (h) => h.teamId === teamId || h.teamId === undefined
      );
    }

    return results;
  },
});

// ============================================================================
// Provider Health Mutations
// ============================================================================

/**
 * Upsert provider health status.
 */
export const upsertProviderHealth = mutation({
  args: {
    providerId: v.string(),
    status: v.union(
      v.literal("healthy"),
      v.literal("degraded"),
      v.literal("unhealthy")
    ),
    circuitState: v.union(
      v.literal("closed"),
      v.literal("open"),
      v.literal("half-open")
    ),
    failureCount: v.number(),
    successRate: v.number(),
    latencyP50: v.number(),
    latencyP99: v.number(),
    totalRequests: v.number(),
    lastError: v.optional(v.string()),
    teamId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Find existing record
    const existing = args.teamId
      ? await ctx.db
          .query("providerHealth")
          .withIndex("by_team_provider", (q) =>
            q.eq("teamId", args.teamId).eq("providerId", args.providerId)
          )
          .first()
      : await ctx.db
          .query("providerHealth")
          .withIndex("by_provider", (q) => q.eq("providerId", args.providerId))
          .filter((q) => q.eq(q.field("teamId"), undefined))
          .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: args.status,
        circuitState: args.circuitState,
        failureCount: args.failureCount,
        successRate: args.successRate,
        latencyP50: args.latencyP50,
        latencyP99: args.latencyP99,
        totalRequests: args.totalRequests,
        lastError: args.lastError,
        lastCheck: now,
      });
      return existing._id;
    }

    return ctx.db.insert("providerHealth", {
      providerId: args.providerId,
      status: args.status,
      circuitState: args.circuitState,
      failureCount: args.failureCount,
      successRate: args.successRate,
      latencyP50: args.latencyP50,
      latencyP99: args.latencyP99,
      totalRequests: args.totalRequests,
      lastError: args.lastError,
      lastCheck: now,
      teamId: args.teamId,
    });
  },
});
