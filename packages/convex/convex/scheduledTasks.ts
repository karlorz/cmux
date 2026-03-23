import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Scheduled Tasks - recurring agent task execution
 *
 * Enables "always-on" agents like Claude /loop and Cursor Automations.
 * Users can schedule recurring tasks that spawn agents on a cron schedule.
 */

// Schedule type validators
const scheduleTypeValidator = v.union(
  v.literal("interval"),
  v.literal("daily"),
  v.literal("weekly"),
  v.literal("cron")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("disabled")
);

/**
 * Calculate the next run time based on schedule configuration.
 */
function calculateNextRunAt(
  schedule: {
    scheduleType: "interval" | "daily" | "weekly" | "cron";
    intervalMinutes?: number;
    hourUTC?: number;
    minuteUTC?: number;
    dayOfWeek?: number;
    cronExpression?: string;
  },
  fromTime: number = Date.now()
): number {
  const now = new Date(fromTime);

  switch (schedule.scheduleType) {
    case "interval": {
      const minutes = schedule.intervalMinutes ?? 60;
      return fromTime + minutes * 60 * 1000;
    }

    case "daily": {
      const hour = schedule.hourUTC ?? 9;
      const minute = schedule.minuteUTC ?? 0;

      const next = new Date(now);
      next.setUTCHours(hour, minute, 0, 0);

      // If time has passed today, schedule for tomorrow
      if (next.getTime() <= fromTime) {
        next.setUTCDate(next.getUTCDate() + 1);
      }

      return next.getTime();
    }

    case "weekly": {
      const hour = schedule.hourUTC ?? 9;
      const minute = schedule.minuteUTC ?? 0;
      const targetDay = schedule.dayOfWeek ?? 1; // Monday default

      const next = new Date(now);
      next.setUTCHours(hour, minute, 0, 0);

      // Find next occurrence of target day
      const currentDay = next.getUTCDay();
      let daysUntilTarget = targetDay - currentDay;
      if (daysUntilTarget < 0 || (daysUntilTarget === 0 && next.getTime() <= fromTime)) {
        daysUntilTarget += 7;
      }

      next.setUTCDate(next.getUTCDate() + daysUntilTarget);
      return next.getTime();
    }

    case "cron": {
      // Simple cron parsing for common patterns
      // Full cron parsing would require a library
      // For now, default to daily at midnight UTC
      const next = new Date(now);
      next.setUTCHours(0, 0, 0, 0);
      next.setUTCDate(next.getUTCDate() + 1);
      return next.getTime();
    }

    default:
      return fromTime + 60 * 60 * 1000; // Default: 1 hour
  }
}

/**
 * Create a new scheduled task.
 */
export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    prompt: v.string(),
    repoFullName: v.optional(v.string()),
    branch: v.optional(v.string()),
    agentName: v.string(),
    scheduleType: scheduleTypeValidator,
    intervalMinutes: v.optional(v.number()),
    hourUTC: v.optional(v.number()),
    minuteUTC: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    cronExpression: v.optional(v.string()),
    maxConcurrentRuns: v.optional(v.number()),
    maxRunsPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    // Validate schedule configuration
    if (args.scheduleType === "interval" && !args.intervalMinutes) {
      throw new Error("intervalMinutes required for interval schedule");
    }
    if (args.scheduleType === "cron" && !args.cronExpression) {
      throw new Error("cronExpression required for cron schedule");
    }

    // Calculate first run time
    const nextRunAt = calculateNextRunAt({
      scheduleType: args.scheduleType,
      intervalMinutes: args.intervalMinutes,
      hourUTC: args.hourUTC,
      minuteUTC: args.minuteUTC,
      dayOfWeek: args.dayOfWeek,
      cronExpression: args.cronExpression,
    });

    const scheduledTaskId = await ctx.db.insert("scheduledTasks", {
      teamId,
      userId,
      name: args.name,
      description: args.description,
      prompt: args.prompt,
      repoFullName: args.repoFullName,
      branch: args.branch,
      agentName: args.agentName,
      scheduleType: args.scheduleType,
      intervalMinutes: args.intervalMinutes,
      hourUTC: args.hourUTC,
      minuteUTC: args.minuteUTC,
      dayOfWeek: args.dayOfWeek,
      cronExpression: args.cronExpression,
      status: "active",
      nextRunAt,
      runCount: 0,
      failureCount: 0,
      maxConcurrentRuns: args.maxConcurrentRuns ?? 1,
      maxRunsPerDay: args.maxRunsPerDay,
      createdAt: now,
      updatedAt: now,
    });

    return { scheduledTaskId, nextRunAt };
  },
});

/**
 * List scheduled tasks for a team.
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    status: v.optional(statusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    let tasks;
    if (args.status) {
      tasks = await ctx.db
        .query("scheduledTasks")
        .withIndex("by_team", (q) =>
          q.eq("teamId", teamId).eq("status", args.status!)
        )
        .take(limit);
    } else {
      tasks = await ctx.db
        .query("scheduledTasks")
        .withIndex("by_team", (q) => q.eq("teamId", teamId))
        .filter((q) => q.neq(q.field("status"), "disabled"))
        .take(limit);
    }

    return tasks;
  },
});

/**
 * Get a scheduled task by ID.
 */
export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId) {
      return null;
    }

    // Get recent runs
    const recentRuns = await ctx.db
      .query("scheduledTaskRuns")
      .withIndex("by_scheduled_task", (q) =>
        q.eq("scheduledTaskId", args.scheduledTaskId)
      )
      .order("desc")
      .take(10);

    return { ...task, recentRuns };
  },
});

/**
 * Update a scheduled task.
 */
export const update = authMutation({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    prompt: v.optional(v.string()),
    agentName: v.optional(v.string()),
    scheduleType: v.optional(scheduleTypeValidator),
    intervalMinutes: v.optional(v.number()),
    hourUTC: v.optional(v.number()),
    minuteUTC: v.optional(v.number()),
    dayOfWeek: v.optional(v.number()),
    cronExpression: v.optional(v.string()),
    maxConcurrentRuns: v.optional(v.number()),
    maxRunsPerDay: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Scheduled task not found or unauthorized");
    }

    const now = Date.now();
    const updates: Partial<Doc<"scheduledTasks">> = {
      updatedAt: now,
    };

    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.prompt !== undefined) updates.prompt = args.prompt;
    if (args.agentName !== undefined) updates.agentName = args.agentName;
    if (args.scheduleType !== undefined) updates.scheduleType = args.scheduleType;
    if (args.intervalMinutes !== undefined) updates.intervalMinutes = args.intervalMinutes;
    if (args.hourUTC !== undefined) updates.hourUTC = args.hourUTC;
    if (args.minuteUTC !== undefined) updates.minuteUTC = args.minuteUTC;
    if (args.dayOfWeek !== undefined) updates.dayOfWeek = args.dayOfWeek;
    if (args.cronExpression !== undefined) updates.cronExpression = args.cronExpression;
    if (args.maxConcurrentRuns !== undefined) updates.maxConcurrentRuns = args.maxConcurrentRuns;
    if (args.maxRunsPerDay !== undefined) updates.maxRunsPerDay = args.maxRunsPerDay;

    // Recalculate next run if schedule changed
    if (
      args.scheduleType !== undefined ||
      args.intervalMinutes !== undefined ||
      args.hourUTC !== undefined ||
      args.minuteUTC !== undefined ||
      args.dayOfWeek !== undefined ||
      args.cronExpression !== undefined
    ) {
      const scheduleConfig = {
        scheduleType: args.scheduleType ?? task.scheduleType,
        intervalMinutes: args.intervalMinutes ?? task.intervalMinutes,
        hourUTC: args.hourUTC ?? task.hourUTC,
        minuteUTC: args.minuteUTC ?? task.minuteUTC,
        dayOfWeek: args.dayOfWeek ?? task.dayOfWeek,
        cronExpression: args.cronExpression ?? task.cronExpression,
      };
      updates.nextRunAt = calculateNextRunAt(scheduleConfig);
    }

    await ctx.db.patch(args.scheduledTaskId, updates);

    return { ok: true };
  },
});

/**
 * Pause a scheduled task.
 */
export const pause = authMutation({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Scheduled task not found or unauthorized");
    }

    await ctx.db.patch(args.scheduledTaskId, {
      status: "paused",
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Resume a paused scheduled task.
 */
export const resume = authMutation({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Scheduled task not found or unauthorized");
    }

    // Recalculate next run time
    const nextRunAt = calculateNextRunAt({
      scheduleType: task.scheduleType,
      intervalMinutes: task.intervalMinutes,
      hourUTC: task.hourUTC,
      minuteUTC: task.minuteUTC,
      dayOfWeek: task.dayOfWeek,
      cronExpression: task.cronExpression,
    });

    await ctx.db.patch(args.scheduledTaskId, {
      status: "active",
      nextRunAt,
      failureCount: 0, // Reset failure count on resume
      updatedAt: Date.now(),
    });

    return { ok: true, nextRunAt };
  },
});

/**
 * Delete a scheduled task.
 */
export const remove = authMutation({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Scheduled task not found or unauthorized");
    }

    // Soft delete by setting to disabled
    await ctx.db.patch(args.scheduledTaskId, {
      status: "disabled",
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Trigger a scheduled task to run immediately (manual trigger for testing).
 */
export const triggerNow = authMutation({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Scheduled task not found or unauthorized");
    }

    if (task.status === "disabled") {
      throw new Error("Cannot trigger a disabled task");
    }

    // Schedule immediate execution
    await ctx.scheduler.runAfter(0, internal.scheduledTasks.startRun, {
      scheduledTaskId: args.scheduledTaskId,
    });

    return { ok: true, message: "Task triggered" };
  },
});

/**
 * Get run history for a scheduled task.
 */
export const getRunHistory = authQuery({
  args: {
    teamSlugOrId: v.string(),
    scheduledTaskId: v.id("scheduledTasks"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.teamId !== teamId) {
      return [];
    }

    const runs = await ctx.db
      .query("scheduledTaskRuns")
      .withIndex("by_scheduled_task", (q) =>
        q.eq("scheduledTaskId", args.scheduledTaskId)
      )
      .order("desc")
      .take(limit);

    return runs;
  },
});

/**
 * Internal: Get tasks ready to run.
 */
export const getReadyTasks = internalQuery({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 100;
    const now = Date.now();

    // Find active tasks whose next run time has passed
    const readyTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_next_run", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.neq(q.field("nextRunAt"), undefined),
          q.lte(q.field("nextRunAt"), now)
        )
      )
      .take(limit);

    return readyTasks;
  },
});

/**
 * Internal: Poll for ready tasks and start them.
 * Called by the scheduler cron job every minute.
 */
export const pollAndStartReadyTasks = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find active tasks whose next run time has passed
    const readyTasks = await ctx.db
      .query("scheduledTasks")
      .withIndex("by_next_run", (q) => q.eq("status", "active"))
      .filter((q) =>
        q.and(
          q.neq(q.field("nextRunAt"), undefined),
          q.lte(q.field("nextRunAt"), now)
        )
      )
      .take(100);

    let started = 0;
    let skipped = 0;

    for (const task of readyTasks) {
      // Check rate limiting
      if (task.maxRunsPerDay && (task.runsToday ?? 0) >= task.maxRunsPerDay) {
        skipped++;
        continue;
      }

      // Create run record
      const runId = await ctx.db.insert("scheduledTaskRuns", {
        scheduledTaskId: task._id,
        teamId: task.teamId,
        status: "pending",
        triggeredAt: now,
        createdAt: now,
      });

      // Calculate next run time
      const nextRunAt = calculateNextRunAt({
        scheduleType: task.scheduleType,
        intervalMinutes: task.intervalMinutes,
        hourUTC: task.hourUTC,
        minuteUTC: task.minuteUTC,
        dayOfWeek: task.dayOfWeek,
        cronExpression: task.cronExpression,
      });

      // Update task
      await ctx.db.patch(task._id, {
        lastRunAt: now,
        nextRunAt,
        runCount: task.runCount + 1,
        runsToday: (task.runsToday ?? 0) + 1,
        lastRunStatus: "pending",
        updatedAt: now,
      });

      started++;

      // Schedule the actual agent spawn (handled by orchestration worker)
      await ctx.scheduler.runAfter(0, internal.scheduledTasks.executeScheduledRun, {
        runId,
        scheduledTaskId: task._id,
      });
    }

    if (started > 0 || skipped > 0) {
      console.log(`[scheduledTasks] Poll complete: ${started} started, ${skipped} skipped (rate limited)`);
    }

    return { started, skipped };
  },
});

/**
 * Internal: Execute a scheduled task run by spawning an agent.
 */
export const executeScheduledRun = internalMutation({
  args: {
    runId: v.id("scheduledTaskRuns"),
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.scheduledTaskId);
    const run = await ctx.db.get(args.runId);

    if (!task || !run) {
      return { ok: false, reason: "Task or run not found" };
    }

    // Update run to running status
    await ctx.db.patch(args.runId, {
      status: "running",
    });

    // The actual agent spawning will be handled by the orchestration system
    // This mutation just marks the run as ready and provides the task context
    // The orchestration worker will pick this up and spawn the agent

    console.log(`[scheduledTasks] Executing scheduled run ${args.runId} for task "${task.name}"`);

    return {
      ok: true,
      task: {
        name: task.name,
        prompt: task.prompt,
        agentName: task.agentName,
        repoFullName: task.repoFullName,
        branch: task.branch,
      },
    };
  },
});

/**
 * Internal: Mark a scheduled task as running and create a run record.
 */
export const startRun = internalMutation({
  args: {
    scheduledTaskId: v.id("scheduledTasks"),
  },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.scheduledTaskId);
    if (!task || task.status !== "active") {
      return { ok: false, reason: "Task not active" };
    }

    const now = Date.now();

    // Check rate limiting
    if (task.maxRunsPerDay && (task.runsToday ?? 0) >= task.maxRunsPerDay) {
      return { ok: false, reason: "Daily run limit reached" };
    }

    // Create run record
    const runId = await ctx.db.insert("scheduledTaskRuns", {
      scheduledTaskId: args.scheduledTaskId,
      teamId: task.teamId,
      status: "pending",
      triggeredAt: now,
      createdAt: now,
    });

    // Update task with next run time
    const nextRunAt = calculateNextRunAt({
      scheduleType: task.scheduleType,
      intervalMinutes: task.intervalMinutes,
      hourUTC: task.hourUTC,
      minuteUTC: task.minuteUTC,
      dayOfWeek: task.dayOfWeek,
      cronExpression: task.cronExpression,
    });

    await ctx.db.patch(args.scheduledTaskId, {
      lastRunAt: now,
      nextRunAt,
      runCount: task.runCount + 1,
      runsToday: (task.runsToday ?? 0) + 1,
      lastRunStatus: "pending",
      updatedAt: now,
    });

    return { ok: true, runId, task };
  },
});

/**
 * Internal: Update run status after completion.
 */
export const completeRun = internalMutation({
  args: {
    runId: v.id("scheduledTaskRuns"),
    status: v.union(v.literal("completed"), v.literal("failed")),
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    errorMessage: v.optional(v.string()),
    summary: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;

    const now = Date.now();

    await ctx.db.patch(args.runId, {
      status: args.status,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      completedAt: now,
      errorMessage: args.errorMessage,
      summary: args.summary,
    });

    // Update parent task
    const task = await ctx.db.get(run.scheduledTaskId);
    if (task) {
      const updates: Partial<Doc<"scheduledTasks">> = {
        lastRunStatus: args.status,
        lastRunTaskId: args.taskId,
        updatedAt: now,
      };

      if (args.status === "failed") {
        updates.failureCount = task.failureCount + 1;

        // Back off after consecutive failures
        if (task.failureCount >= 3) {
          updates.status = "paused";
          console.log(
            `[scheduledTasks] Pausing task ${task._id} after ${task.failureCount + 1} consecutive failures`
          );
        }
      } else {
        updates.failureCount = 0; // Reset on success
      }

      await ctx.db.patch(run.scheduledTaskId, updates);
    }
  },
});

/**
 * Internal: Reset daily run counters.
 * Called by daily cron job.
 */
export const resetDailyCounters = internalMutation({
  args: {},
  handler: async (ctx) => {
    const tasks = await ctx.db
      .query("scheduledTasks")
      .filter((q) =>
        q.and(
          q.neq(q.field("runsToday"), undefined),
          q.gt(q.field("runsToday"), 0)
        )
      )
      .collect();

    for (const task of tasks) {
      await ctx.db.patch(task._id, {
        runsToday: 0,
        updatedAt: Date.now(),
      });
    }

    return { reset: tasks.length };
  },
});
