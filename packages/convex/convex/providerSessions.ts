/**
 * Provider Session Bindings - Mutations and queries for session persistence.
 *
 * Provides durable storage for provider-specific session identifiers,
 * enabling task-bound resume and continuity across retries.
 *
 * Use cases:
 * - Resume a Claude session after task retry
 * - Continue a Codex thread for iterative work
 * - Track which provider session is bound to which task
 */

import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";

// =============================================================================
// Validators
// =============================================================================

const providerValidator = v.union(
  v.literal("claude"),
  v.literal("codex"),
  v.literal("gemini"),
  v.literal("opencode"),
  v.literal("amp"),
  v.literal("grok"),
  v.literal("cursor"),
  v.literal("qwen")
);

const modeValidator = v.union(
  v.literal("head"),
  v.literal("worker"),
  v.literal("reviewer")
);

const statusValidator = v.union(
  v.literal("active"),
  v.literal("suspended"),
  v.literal("expired"),
  v.literal("terminated")
);

const replyChannelValidator = v.union(
  v.literal("mailbox"),
  v.literal("sse"),
  v.literal("pty"),
  v.literal("ui")
);

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Create or update a provider session binding.
 */
export const bindSession = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    taskId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    agentName: v.string(),
    provider: providerValidator,
    mode: modeValidator,
    providerSessionId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
    providerConversationId: v.optional(v.string()),
    replyChannel: v.optional(replyChannelValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();

    // Check for existing binding
    const existing = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (existing) {
      // Update existing binding
      await ctx.db.patch(existing._id, {
        providerSessionId: args.providerSessionId ?? existing.providerSessionId,
        providerThreadId: args.providerThreadId ?? existing.providerThreadId,
        providerConversationId:
          args.providerConversationId ?? existing.providerConversationId,
        replyChannel: args.replyChannel ?? existing.replyChannel,
        taskRunId: args.taskRunId ?? existing.taskRunId,
        status: "active",
        lastActiveAt: now,
        updatedAt: now,
      });
      return { bindingId: existing._id, updated: true };
    }

    // Create new binding
    const bindingId = await ctx.db.insert("providerSessionBindings", {
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      teamId,
      agentName: args.agentName,
      provider: args.provider,
      mode: args.mode,
      providerSessionId: args.providerSessionId,
      providerThreadId: args.providerThreadId,
      providerConversationId: args.providerConversationId,
      replyChannel: args.replyChannel,
      status: "active",
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return { bindingId, updated: false };
  },
});

/**
 * Update session status (suspend, expire, terminate).
 */
export const updateSessionStatus = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskId: v.string(),
    status: statusValidator,
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (!binding || binding.teamId !== teamId) {
      throw new Error("Session binding not found or unauthorized");
    }

    await ctx.db.patch(binding._id, {
      status: args.status,
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Record session activity (heartbeat).
 */
export const recordActivity = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (!binding || binding.teamId !== teamId) {
      return { success: false };
    }

    await ctx.db.patch(binding._id, {
      lastActiveAt: Date.now(),
      updatedAt: Date.now(),
    });

    return { success: true };
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get session binding for a task.
 */
export const getByTask = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (!binding || binding.teamId !== teamId) {
      return null;
    }

    return binding;
  },
});

/**
 * Get session binding for a task run.
 */
export const getByTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .first();

    if (!binding || binding.teamId !== teamId) {
      return null;
    }

    return binding;
  },
});

/**
 * Resume ancestry summary for UI display.
 * Returns session binding info with ancestry context:
 * - Whether this run has a bound provider session
 * - Whether it's a resumed session (has prior activity)
 * - Provider-specific resume identifiers
 */
export interface ResumeAncestry {
  /** Whether a session binding exists */
  hasBoundSession: boolean;
  /** Provider name (claude, codex, etc.) */
  provider: string | null;
  /** Agent mode (head, worker, reviewer) */
  mode: string | null;
  /** Provider-specific session ID (Claude) */
  providerSessionId: string | null;
  /** Provider-specific thread ID (Codex) */
  providerThreadId: string | null;
  /** Session status */
  status: "active" | "suspended" | "expired" | "terminated" | null;
  /** When session was created */
  createdAt: number | null;
  /** When session was last active */
  lastActiveAt: number | null;
  /** Whether this appears to be a resumed session */
  isResumedSession: boolean;
  /** Reply channel preference */
  replyChannel: "mailbox" | "sse" | "pty" | "ui" | null;
}

export const getResumeAncestry = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args): Promise<ResumeAncestry> => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Get binding for this task run
    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .first();

    if (!binding || binding.teamId !== teamId) {
      return {
        hasBoundSession: false,
        provider: null,
        mode: null,
        providerSessionId: null,
        providerThreadId: null,
        status: null,
        createdAt: null,
        lastActiveAt: null,
        isResumedSession: false,
        replyChannel: null,
      };
    }

    // Check if this is a resumed session by looking at task-level bindings
    // A session is considered "resumed" if the task had a prior binding before this run
    const taskBinding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", binding.taskId))
      .first();

    const isResumedSession =
      taskBinding !== null &&
      taskBinding.createdAt !== null &&
      binding.createdAt !== null &&
      taskBinding.createdAt < binding.createdAt;

    return {
      hasBoundSession: true,
      provider: binding.provider,
      mode: binding.mode,
      providerSessionId: binding.providerSessionId ?? null,
      providerThreadId: binding.providerThreadId ?? null,
      status: binding.status,
      createdAt: binding.createdAt ?? null,
      lastActiveAt: binding.lastActiveAt ?? null,
      isResumedSession,
      replyChannel: binding.replyChannel ?? null,
    };
  },
});

/**
 * Get all session bindings for an orchestration.
 */
export const getByOrchestration = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    let bindings = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_orchestration", (q) =>
        q.eq("orchestrationId", args.orchestrationId)
      )
      .collect();

    // Filter by team (security)
    bindings = bindings.filter((b) => b.teamId === teamId);

    // Filter by status if specified
    if (args.status) {
      bindings = bindings.filter((b) => b.status === args.status);
    }

    return bindings;
  },
});

/**
 * Get active sessions by provider.
 */
export const getActiveByProvider = authQuery({
  args: {
    teamSlugOrId: v.string(),
    provider: providerValidator,
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    const bindings = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_team_provider", (q) =>
        q.eq("teamId", teamId).eq("provider", args.provider).eq("status", "active")
      )
      .take(limit);

    return bindings;
  },
});

// =============================================================================
// Internal Mutations (for background worker)
// =============================================================================

/**
 * Bind session internally (no auth).
 */
export const bindSessionInternal = internalMutation({
  args: {
    teamId: v.string(),
    orchestrationId: v.string(),
    taskId: v.string(),
    taskRunId: v.optional(v.id("taskRuns")),
    agentName: v.string(),
    provider: providerValidator,
    mode: modeValidator,
    providerSessionId: v.optional(v.string()),
    providerThreadId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    // Check for existing binding
    const existing = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        providerSessionId: args.providerSessionId ?? existing.providerSessionId,
        providerThreadId: args.providerThreadId ?? existing.providerThreadId,
        taskRunId: args.taskRunId ?? existing.taskRunId,
        status: "active",
        lastActiveAt: now,
        updatedAt: now,
      });
      return existing._id;
    }

    return ctx.db.insert("providerSessionBindings", {
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      teamId: args.teamId,
      agentName: args.agentName,
      provider: args.provider,
      mode: args.mode,
      providerSessionId: args.providerSessionId,
      providerThreadId: args.providerThreadId,
      status: "active",
      lastActiveAt: now,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Terminate session when task completes.
 */
export const terminateSessionInternal = internalMutation({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const binding = await ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();

    if (binding) {
      await ctx.db.patch(binding._id, {
        status: "terminated",
        updatedAt: Date.now(),
      });
    }
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Get session binding for resume (internal).
 */
export const getForResume = internalQuery({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("providerSessionBindings")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .first();
  },
});
