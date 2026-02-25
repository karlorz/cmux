/**
 * Orchestration Background Worker
 *
 * Polls for ready orchestration tasks and auto-spawns agents.
 * This enables autonomous multi-agent orchestration where tasks are
 * automatically processed without manual intervention.
 *
 * ## Current Status: DISABLED
 *
 * Background auto-spawning is currently disabled because the worker cannot
 * obtain valid Stack Auth JWTs needed for Convex mutations. The worker runs
 * as an internal action without user context.
 *
 * ## How It Would Work (When Enabled)
 *
 * 1. Cron job calls pollReadyTasks every minute
 * 2. Worker queries for pending orchestration tasks with resolved dependencies
 * 3. For each ready task, worker calls dispatchSpawn
 * 4. dispatchSpawn makes HTTP request to apps/server internal spawn endpoint
 * 5. Server spawns agent using existing infrastructure
 *
 * ## Unblock Conditions
 *
 * To re-enable background spawning, implement one of:
 *
 * 1. **Service Account Auth**: Create a Stack Auth service account that can
 *    obtain JWTs for internal operations. This requires Stack Auth config
 *    changes and a secure way to store service credentials.
 *
 * 2. **Admin Key Access**: Add support for Convex admin key-based operations
 *    that bypass user auth for internal workflows. This requires careful
 *    scoping to prevent privilege escalation.
 *
 * 3. **Pre-fetch Strategy**: Have the worker pre-fetch all needed data
 *    (task details, JWT tokens) and pass to the spawn endpoint. Complex
 *    because JWTs have short lifetimes.
 *
 * ## Current Workaround
 *
 * Users must manually spawn orchestration tasks via:
 * - CLI: `cmux-devbox orchestrate spawn --agent <name> --prompt <prompt>`
 * - Web UI: Orchestration panel spawn button
 * - API: POST /api/orchestrate/spawn with Bearer token
 *
 * See: apps/server/src/http-api.ts handleOrchestrationInternalSpawn
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";

// Configuration (used when background spawning is re-enabled)
// const MAX_CONCURRENT_SPAWNS = 3; // Per-team concurrent spawn limit

/**
 * Poll for ready tasks across all teams.
 * Called by cron job every minute.
 *
 * NOTE: Background auto-spawning is currently DISABLED.
 * The worker cannot obtain valid Stack Auth JWTs needed for Convex operations.
 * Spawns must be initiated by authenticated users via CLI or web UI.
 *
 * This function is a no-op until service auth is implemented.
 * See http-api.ts handleOrchestrationInternalSpawn for details.
 */
export const pollReadyTasks = internalAction({
  args: {},
  handler: async (_ctx) => {
    // Background spawning disabled - see handleOrchestrationInternalSpawn
    // When service auth is implemented, uncomment the code below.
    return;

    /*
    // Get all unique team IDs with pending tasks
    const teams = await ctx.runQuery(
      internal.orchestrationWorker.getTeamsWithPendingTasks
    );

    for (const teamId of teams) {
      // Check concurrent limit
      const runningCount = await ctx.runQuery(
        internal.orchestrationQueries.countRunningTasks,
        { teamId }
      );

      if (runningCount >= MAX_CONCURRENT_SPAWNS) {
        continue; // Team at capacity
      }

      // Get ready tasks (respecting dependency resolution)
      const readyTasks = await ctx.runQuery(
        internal.orchestrationQueries.getReadyTasksInternal,
        { teamId, limit: MAX_CONCURRENT_SPAWNS - runningCount }
      );

      // Filter out tasks in backoff period
      const now = Date.now();
      const eligibleTasks = readyTasks.filter(
        (t) => !t.nextRetryAfter || t.nextRetryAfter <= now
      );

      // Dispatch spawns (each runs independently)
      for (const task of eligibleTasks) {
        await ctx.scheduler.runAfter(
          0,
          internal.orchestrationWorker.dispatchSpawn,
          {
            taskId: task._id,
            teamId,
          }
        );
      }
    }
    */
  },
});

/**
 * Get unique team IDs with pending tasks.
 */
export const getTeamsWithPendingTasks = internalQuery({
  args: {},
  handler: async (ctx) => {
    const pendingTasks = await ctx.db
      .query("orchestrationTasks")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    return [...new Set(pendingTasks.map((t) => t.teamId))];
  },
});

/**
 * Dispatch a spawn to the apps/server via HTTP.
 */
export const dispatchSpawn = internalAction({
  args: {
    taskId: v.id("orchestrationTasks"),
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    // Get task details
    const task = await ctx.runQuery(
      internal.orchestrationWorker.getTaskForSpawn,
      { taskId: args.taskId }
    );
    if (!task) return;

    // Claim the task (atomic)
    const claimed = await ctx.runMutation(
      internal.orchestrationQueries.claimTask,
      {
        taskId: args.taskId,
        agentName: task.assignedAgentName ?? "claude/haiku-4.5",
      }
    );
    if (!claimed) return; // Another worker claimed it

    try {
      // Get JWT for the task run (needed for spawn to authenticate)
      if (!task.taskRunId) {
        throw new Error("Task run not created yet");
      }
      const jwtResult = await ctx.runMutation(
        internal.taskRuns.getJwtInternal,
        { taskRunId: task.taskRunId }
      );

      // Call server to spawn
      const serverUrl = process.env.CMUX_SERVER_URL ?? "http://localhost:9779";
      const internalSecret = process.env.CMUX_INTERNAL_SECRET ?? "";

      const response = await fetch(
        `${serverUrl}/api/orchestrate/internal/spawn`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Secret": internalSecret,
          },
          body: JSON.stringify({
            orchestrationTaskId: args.taskId,
            teamId: args.teamId,
            agentName: task.assignedAgentName ?? "claude/haiku-4.5",
            prompt: task.prompt,
            taskId: task.taskId,
            taskRunId: task.taskRunId,
            // Pass JWT and user info for auth context
            taskRunJwt: jwtResult.jwt,
            userId: jwtResult.userId,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Spawn failed: ${response.status} - ${errorText}`);
      }

      // Update task to running status
      await ctx.runMutation(internal.orchestrationQueries.startTaskInternal, {
        taskId: args.taskId,
      });
    } catch (error) {
      // Schedule retry with backoff
      await ctx.runMutation(internal.orchestrationQueries.scheduleRetry, {
        taskId: args.taskId,
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }
  },
});

/**
 * Get task details for spawning.
 */
export const getTaskForSpawn = internalQuery({
  args: {
    taskId: v.id("orchestrationTasks"),
  },
  handler: async (ctx, args) => {
    return ctx.db.get(args.taskId);
  },
});

/**
 * Handle task completion (called from taskRuns.workerComplete).
 * Updates orchestration task status based on exit code.
 */
export const handleTaskCompletion = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Find orchestration task by taskRunId
    const orchTask = await ctx.db
      .query("orchestrationTasks")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .first();

    if (!orchTask) return; // Not an orchestration-managed task

    const now = Date.now();

    if (args.exitCode === 0 || args.exitCode === undefined) {
      // Success (exitCode 0 or not specified = success)
      await ctx.db.patch(orchTask._id, {
        status: "completed",
        completedAt: now,
        updatedAt: now,
      });
    } else {
      // Failure
      await ctx.db.patch(orchTask._id, {
        status: "failed",
        errorMessage: `Agent exited with code ${args.exitCode}`,
        completedAt: now,
        updatedAt: now,
      });
    }

    // Note: Dependent tasks will be picked up by next poll cycle
    // since getReadyTasksInternal() checks dependency completion
  },
});
