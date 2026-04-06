import { RUN_CONTROL_DEFAULT_TIMEOUT_MINUTES } from "@cmux/shared/convex-safe";
import { v } from "convex/values";
import { resolveTeamIdLoose } from "../_shared/team";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authMutation, authQuery } from "./users/utils";

const terminalValidator = v.union(
  v.literal("terminal"),
  v.literal("iterm"),
  v.literal("ghostty"),
  v.literal("alacritty"),
);

function createInitialRunControlState(now: number) {
  return {
    inactivityTimeoutMinutes: RUN_CONTROL_DEFAULT_TIMEOUT_MINUTES,
    lastActivityAt: now,
    lastActivitySource: "spawn" as const,
  };
}

export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const limit = Math.max(1, Math.min(args.limit ?? 5, 20));
    const launches = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .order("desc")
      .take(limit);

    return launches.map((launch) => ({
      id: launch._id,
      launchId: launch.launchId,
      command: launch.command,
      workspacePath: launch.workspacePath,
      terminal: launch.terminal,
      status: launch.status,
      scriptPath: launch.scriptPath,
      orchestrationId: launch.orchestrationId,
      taskId: launch.taskId ? String(launch.taskId) : undefined,
      taskRunId: launch.taskRunId ? String(launch.taskRunId) : undefined,
      agentName: launch.agentName,
      runDir: launch.runDir,
      sessionInfoPath: launch.sessionInfoPath,
      sessionId: launch.sessionId,
      injectionMode: launch.injectionMode,
      lastInjectionAt: launch.lastInjectionAt,
      injectionCount: launch.injectionCount,
      checkpointRef: launch.checkpointRef,
      checkpointGeneration: launch.checkpointGeneration,
      checkpointLabel: launch.checkpointLabel,
      checkpointCreatedAt: launch.checkpointCreatedAt,
      error: launch.error,
      exitCode: launch.exitCode,
      launchedAt: new Date(launch.launchedAt).toISOString(),
      exitedAt: launch.exitedAt ? new Date(launch.exitedAt).toISOString() : undefined,
    }));
  },
});

export const getByOrchestrationId = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const launch = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_orchestration", (q) =>
        q.eq("teamId", teamId).eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .first();

    if (!launch) {
      return null;
    }

    return {
      id: launch._id,
      launchId: launch.launchId,
      orchestrationId: launch.orchestrationId,
      taskId: launch.taskId ? String(launch.taskId) : undefined,
      taskRunId: launch.taskRunId ? String(launch.taskRunId) : undefined,
      agentName: launch.agentName,
      sessionId: launch.sessionId,
      injectionMode: launch.injectionMode,
      lastInjectionAt: launch.lastInjectionAt,
      injectionCount: launch.injectionCount,
      status: launch.status,
      workspacePath: launch.workspacePath,
      runDir: launch.runDir,
    };
  },
});

export const record = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    command: v.string(),
    workspacePath: v.string(),
    terminal: terminalValidator,
    status: v.union(
      v.literal("launched"),
      v.literal("launch_failed"),
      v.literal("completed"),
      v.literal("completed_failed")
    ),
    scriptPath: v.optional(v.string()),
    orchestrationId: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    agentName: v.optional(v.string()),
    runDir: v.optional(v.string()),
    sessionInfoPath: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    injectionMode: v.optional(v.string()),
    lastInjectionAt: v.optional(v.string()),
    injectionCount: v.optional(v.number()),
    checkpointRef: v.optional(v.string()),
    checkpointGeneration: v.optional(v.number()),
    checkpointLabel: v.optional(v.string()),
    checkpointCreatedAt: v.optional(v.number()),
    error: v.optional(v.string()),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    return await ctx.db.insert("localClaudeLaunches", {
      teamId,
      userId,
      launchId: args.launchId,
      command: args.command,
      workspacePath: args.workspacePath,
      terminal: args.terminal,
      status: args.status,
      scriptPath: args.scriptPath,
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      agentName: args.agentName,
      runDir: args.runDir,
      sessionInfoPath: args.sessionInfoPath,
      sessionId: args.sessionId,
      injectionMode: args.injectionMode,
      lastInjectionAt: args.lastInjectionAt,
      injectionCount: args.injectionCount,
      checkpointRef: args.checkpointRef,
      checkpointGeneration: args.checkpointGeneration,
      checkpointLabel: args.checkpointLabel,
      checkpointCreatedAt: args.checkpointCreatedAt,
      error: args.error,
      exitCode: args.exitCode,
      launchedAt: now,
      createdAt: now,
    });
  },
});

function buildLocalLaunchMetadataPatch(input: {
  orchestrationId?: string;
  taskId?: Id<"tasks">;
  taskRunId?: Id<"taskRuns">;
  agentName?: string;
  runDir?: string;
  sessionInfoPath?: string;
  sessionId?: string;
  injectionMode?: string;
  lastInjectionAt?: string;
  injectionCount?: number;
  checkpointRef?: string;
  checkpointGeneration?: number;
  checkpointLabel?: string;
  checkpointCreatedAt?: number;
}) {
  return {
    ...(input.orchestrationId ? { orchestrationId: input.orchestrationId } : {}),
    ...(input.taskId ? { taskId: input.taskId } : {}),
    ...(input.taskRunId ? { taskRunId: input.taskRunId } : {}),
    ...(input.agentName ? { agentName: input.agentName } : {}),
    ...(input.runDir ? { runDir: input.runDir } : {}),
    ...(input.sessionInfoPath ? { sessionInfoPath: input.sessionInfoPath } : {}),
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    ...(input.injectionMode ? { injectionMode: input.injectionMode } : {}),
    ...(input.lastInjectionAt ? { lastInjectionAt: input.lastInjectionAt } : {}),
    ...(typeof input.injectionCount === "number"
      ? { injectionCount: input.injectionCount }
      : {}),
    ...(input.checkpointRef ? { checkpointRef: input.checkpointRef } : {}),
    ...(typeof input.checkpointGeneration === "number"
      ? { checkpointGeneration: input.checkpointGeneration }
      : {}),
    ...(input.checkpointLabel ? { checkpointLabel: input.checkpointLabel } : {}),
    ...(typeof input.checkpointCreatedAt === "number"
      ? { checkpointCreatedAt: input.checkpointCreatedAt }
      : {}),
  };
}

function hasPatchEntries(patch: Record<string, unknown>) {
  return Object.keys(patch).length > 0;
}

export const updateMetadata = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    orchestrationId: v.optional(v.string()),
    taskId: v.optional(v.id("tasks")),
    taskRunId: v.optional(v.id("taskRuns")),
    agentName: v.optional(v.string()),
    runDir: v.optional(v.string()),
    sessionInfoPath: v.optional(v.string()),
    sessionId: v.optional(v.string()),
    injectionMode: v.optional(v.string()),
    lastInjectionAt: v.optional(v.string()),
    injectionCount: v.optional(v.number()),
    checkpointRef: v.optional(v.string()),
    checkpointGeneration: v.optional(v.number()),
    checkpointLabel: v.optional(v.string()),
    checkpointCreatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_launch", (q) => q.eq("teamId", teamId).eq("launchId", args.launchId))
      .first();

    if (!existing) {
      throw new Error("Launch record not found");
    }

    const patch = buildLocalLaunchMetadataPatch({
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      agentName: args.agentName,
      runDir: args.runDir,
      sessionInfoPath: args.sessionInfoPath,
      sessionId: args.sessionId,
      injectionMode: args.injectionMode,
      lastInjectionAt: args.lastInjectionAt,
      injectionCount: args.injectionCount,
      checkpointRef: args.checkpointRef,
      checkpointGeneration: args.checkpointGeneration,
      checkpointLabel: args.checkpointLabel,
      checkpointCreatedAt: args.checkpointCreatedAt,
    });

    if (hasPatchEntries(patch)) {
      await ctx.db.patch(existing._id, patch);
    }

    return existing._id;
  },
});

export const updateMetadataByOrchestrationId = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    sessionId: v.optional(v.string()),
    injectionMode: v.optional(v.string()),
    lastInjectionAt: v.optional(v.string()),
    injectionCount: v.optional(v.number()),
    checkpointRef: v.optional(v.string()),
    checkpointGeneration: v.optional(v.number()),
    checkpointLabel: v.optional(v.string()),
    checkpointCreatedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_orchestration", (q) =>
        q.eq("teamId", teamId).eq("orchestrationId", args.orchestrationId),
      )
      .order("desc")
      .first();

    if (!existing) {
      return null;
    }

    const patch = buildLocalLaunchMetadataPatch({
      sessionId: args.sessionId,
      injectionMode: args.injectionMode,
      lastInjectionAt: args.lastInjectionAt,
      injectionCount: args.injectionCount,
      checkpointRef: args.checkpointRef,
      checkpointGeneration: args.checkpointGeneration,
      checkpointLabel: args.checkpointLabel,
      checkpointCreatedAt: args.checkpointCreatedAt,
    });

    if (hasPatchEntries(patch)) {
      await ctx.db.patch(existing._id, patch);
    }

    return existing._id;
  },
});

export const ensureTaskRunBridge = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    prompt: v.string(),
    workspacePath: v.string(),
    agentName: v.string(),
    orchestrationId: v.string(),
    sessionId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const launch = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_launch", (q) => q.eq("teamId", teamId).eq("launchId", args.launchId))
      .first();

    if (!launch) {
      throw new Error("Launch record not found");
    }

    if (launch.taskId && launch.taskRunId) {
      return {
        taskId: launch.taskId,
        taskRunId: launch.taskRunId,
      };
    }

    const taskId = await ctx.db.insert("tasks", {
      text: args.prompt,
      description: args.prompt,
      projectFullName: undefined,
      worktreePath: args.workspacePath,
      isCompleted: false,
      isArchived: false,
      isPreview: false,
      isLocalWorkspace: true,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: now,
      userId,
      teamId,
    });

    const taskRunId = await ctx.db.insert("taskRuns", {
      taskId,
      prompt: args.prompt,
      agentName: args.agentName,
      status: "running",
      isLocalWorkspace: true,
      createdAt: now,
      updatedAt: now,
      userId,
      teamId,
      orchestrationId: args.orchestrationId,
      runControlState: createInitialRunControlState(now),
    });

    await ctx.scheduler.runAfter(0, internal.runtimeLineage.recordLineage, {
      teamId,
      taskRunId,
      continuationMode: "initial",
      agentName: args.agentName,
      orchestrationId: args.orchestrationId,
      actor: "user",
    });

    await ctx.db.patch(launch._id, {
      taskId,
      taskRunId,
      agentName: args.agentName,
      orchestrationId: args.orchestrationId,
    });

    if (args.sessionId) {
      await ctx.runMutation(internal.providerSessions.bindSessionInternal, {
        teamId,
        orchestrationId: args.orchestrationId,
        taskId: String(taskId),
        taskRunId,
        agentName: args.agentName,
        provider: "claude",
        mode: "worker",
        providerSessionId: args.sessionId,
      });
    }

    return { taskId, taskRunId };
  },
});

export const bindSessionToBridge = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const launch = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_launch", (q) => q.eq("teamId", teamId).eq("launchId", args.launchId))
      .first();

    if (!launch) {
      throw new Error("Launch record not found");
    }

    await ctx.db.patch(launch._id, {
      sessionId: args.sessionId,
    });

    if (!launch.taskId || !launch.taskRunId || !launch.orchestrationId || !launch.agentName) {
      return { success: false };
    }

    await ctx.runMutation(internal.providerSessions.bindSessionInternal, {
      teamId,
      orchestrationId: launch.orchestrationId,
      taskId: String(launch.taskId),
      taskRunId: launch.taskRunId,
      agentName: launch.agentName,
      provider: "claude",
      mode: "worker",
      providerSessionId: args.sessionId,
    });

    return { success: true };
  },
});

export const updateOutcome = authMutation({
  args: {
    teamSlugOrId: v.string(),
    launchId: v.string(),
    status: v.union(v.literal("completed"), v.literal("completed_failed")),
    exitCode: v.optional(v.number()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const existing = await ctx.db
      .query("localClaudeLaunches")
      .withIndex("by_team_launch", (q) => q.eq("teamId", teamId).eq("launchId", args.launchId))
      .first();

    if (!existing) {
      throw new Error("Launch record not found");
    }

    const now = Date.now();

    await ctx.db.patch(existing._id, {
      status: args.status,
      exitCode: args.exitCode,
      error: args.error,
      exitedAt: now,
    });

    if (existing.taskRunId) {
      await ctx.db.patch(existing.taskRunId, {
        status: args.status === "completed" ? "completed" : "failed",
        exitCode: args.exitCode,
        errorMessage: args.error,
        completedAt: now,
        updatedAt: now,
        runControlState: {
          ...createInitialRunControlState(now),
          lastActivityAt: now,
          lastActivitySource: "manual",
        },
      });

      if (existing.taskId) {
        await ctx.db.patch(existing.taskId, {
          isCompleted: args.status === "completed",
          updatedAt: now,
          lastActivityAt: now,
        });
      }

      await ctx.runMutation(internal.providerSessions.terminateSessionInternal, {
        taskId: String(existing.taskId ?? ""),
      });
    }

    return existing._id;
  },
});
