/**
 * Approval Broker - Human-in-the-loop approval handling for orchestration.
 *
 * Provides durable storage and resolution for approval requests from:
 * - Tool use permissions (Claude SDK sessions)
 * - Head agent review requests
 * - Worker escalations
 * - Policy-triggered approvals
 * - Risky action warnings
 *
 * Use cases:
 * - Approve/deny dangerous Bash commands
 * - Review code changes before commit
 * - Authorize cost overrides
 * - Escalate decisions to humans
 */

import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internalMutation, internalQuery } from "./_generated/server";
import { authMutation, authQuery } from "./users/utils";
import {
  generateEventId,
  type ApprovalRequiredEvent,
  type ApprovalResolvedEvent,
} from "@cmux/shared/convex-safe";

// =============================================================================
// Validators
// =============================================================================

const sourceValidator = v.union(
  v.literal("tool_use"),
  v.literal("head_agent"),
  v.literal("worker_agent"),
  v.literal("policy"),
  v.literal("system")
);

const approvalTypeValidator = v.union(
  v.literal("tool_permission"),
  v.literal("review_request"),
  v.literal("deployment"),
  v.literal("cost_override"),
  v.literal("escalation"),
  v.literal("risky_action")
);

const statusValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("denied"),
  v.literal("expired"),
  v.literal("cancelled")
);

const resolutionValidator = v.union(
  v.literal("allow"),
  v.literal("allow_once"),
  v.literal("allow_session"),
  v.literal("deny"),
  v.literal("deny_always")
);

const riskLevelValidator = v.union(
  v.literal("low"),
  v.literal("medium"),
  v.literal("high")
);

// =============================================================================
// ID Generation
// =============================================================================

function generateApprovalId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `apr_${timestamp}${random}`;
}

// =============================================================================
// Public Mutations
// =============================================================================

/**
 * Create a new approval request.
 */
export const createRequest = authMutation({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    taskId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    source: sourceValidator,
    approvalType: approvalTypeValidator,
    action: v.string(),
    context: v.object({
      agentName: v.string(),
      filePath: v.optional(v.string()),
      command: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      riskLevel: v.optional(riskLevelValidator),
    }),
    payload: v.optional(v.any()),
    expiresInMs: v.optional(v.number()), // How long until auto-expire
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();
    const requestId = generateApprovalId();

    const requestDoc = await ctx.db.insert("approvalRequests", {
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      teamId,
      requestId,
      source: args.source,
      approvalType: args.approvalType,
      action: args.action,
      context: args.context,
      payload: args.payload,
      status: "pending",
      expiresAt: args.expiresInMs ? now + args.expiresInMs : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Log approval_required event
    const event: Omit<ApprovalRequiredEvent, "eventId" | "timestamp"> = {
      type: "approval_required",
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      source: args.source,
      action: args.action,
      payload: {
        requestId,
        approvalType: args.approvalType,
        context: args.context,
      },
    };

    await ctx.db.insert("orchestrationEvents", {
      eventId: generateEventId(),
      orchestrationId: args.orchestrationId,
      eventType: "approval_required",
      teamId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      payload: event,
      createdAt: now,
    });

    return { requestId, docId: requestDoc };
  },
});

/**
 * Resolve an approval request (approve or deny).
 */
export const resolveRequest = authMutation({
  args: {
    teamSlugOrId: v.string(),
    requestId: v.string(),
    resolution: resolutionValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const identity = await ctx.auth.getUserIdentity();
    const userId = identity?.subject ?? "unknown";
    const now = Date.now();

    const request = await ctx.db
      .query("approvalRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Approval request not found");
    }

    if (request.teamId !== teamId) {
      throw new Error("Unauthorized: request belongs to different team");
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot resolve: request is ${request.status}`);
    }

    // Determine status from resolution
    const status =
      args.resolution === "allow" ||
      args.resolution === "allow_once" ||
      args.resolution === "allow_session"
        ? "approved"
        : "denied";

    await ctx.db.patch(request._id, {
      status,
      resolvedBy: userId,
      resolvedAt: now,
      resolution: args.resolution,
      resolutionNote: args.note,
      updatedAt: now,
    });

    // Log approval_resolved event
    const event: Omit<ApprovalResolvedEvent, "eventId" | "timestamp"> = {
      type: "approval_resolved",
      orchestrationId: request.orchestrationId,
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      resolution: args.resolution,
    };

    await ctx.db.insert("orchestrationEvents", {
      eventId: generateEventId(),
      orchestrationId: request.orchestrationId,
      eventType: "approval_resolved",
      teamId,
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      correlationId: args.requestId, // Link to original request
      payload: event,
      createdAt: now,
    });

    return { success: true, status };
  },
});

/**
 * Cancel a pending approval request.
 */
export const cancelRequest = authMutation({
  args: {
    teamSlugOrId: v.string(),
    requestId: v.string(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const now = Date.now();

    const request = await ctx.db
      .query("approvalRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Approval request not found");
    }

    if (request.teamId !== teamId) {
      throw new Error("Unauthorized: request belongs to different team");
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot cancel: request is ${request.status}`);
    }

    await ctx.db.patch(request._id, {
      status: "cancelled",
      resolutionNote: args.reason,
      updatedAt: now,
    });

    return { success: true };
  },
});

// =============================================================================
// Public Queries
// =============================================================================

/**
 * Get pending approval requests for an orchestration.
 */
export const getPendingByOrchestration = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const requests = await ctx.db
      .query("approvalRequests")
      .withIndex("by_orchestration_status", (q) =>
        q.eq("orchestrationId", args.orchestrationId).eq("status", "pending")
      )
      .collect();

    // Filter by team (security)
    return requests.filter((r) => r.teamId === teamId);
  },
});

/**
 * Get all approval requests for an orchestration (including resolved).
 */
export const getByOrchestration = authQuery({
  args: {
    teamSlugOrId: v.string(),
    orchestrationId: v.string(),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    let requests;
    if (args.status) {
      const status = args.status; // Narrow type
      requests = await ctx.db
        .query("approvalRequests")
        .withIndex("by_orchestration_status", (q) =>
          q.eq("orchestrationId", args.orchestrationId).eq("status", status)
        )
        .collect();
    } else {
      requests = await ctx.db
        .query("approvalRequests")
        .withIndex("by_orchestration", (q) =>
          q.eq("orchestrationId", args.orchestrationId)
        )
        .collect();
    }

    return requests.filter((r) => r.teamId === teamId);
  },
});

/**
 * Get pending approval requests for a team (for dashboard).
 */
export const getPendingByTeam = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    return ctx.db
      .query("approvalRequests")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "pending")
      )
      .order("desc")
      .take(limit);
  },
});

/**
 * Get approval request by ID.
 */
export const getByRequestId = authQuery({
  args: {
    teamSlugOrId: v.string(),
    requestId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const request = await ctx.db
      .query("approvalRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request || request.teamId !== teamId) {
      return null;
    }

    return request;
  },
});

/**
 * Get approval requests for a specific task run.
 */
export const getByTaskRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
    status: v.optional(statusValidator),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const requests = await ctx.db
      .query("approvalRequests")
      .withIndex("by_task_run", (q) => q.eq("taskRunId", args.taskRunId))
      .collect();

    let filtered = requests.filter((r) => r.teamId === teamId);

    if (args.status) {
      filtered = filtered.filter((r) => r.status === args.status);
    }

    return filtered;
  },
});

// =============================================================================
// Internal Mutations (for background worker)
// =============================================================================

/**
 * Create approval request internally (no auth).
 */
export const createRequestInternal = internalMutation({
  args: {
    teamId: v.string(),
    orchestrationId: v.string(),
    taskId: v.optional(v.string()),
    taskRunId: v.optional(v.id("taskRuns")),
    source: sourceValidator,
    approvalType: approvalTypeValidator,
    action: v.string(),
    context: v.object({
      agentName: v.string(),
      filePath: v.optional(v.string()),
      command: v.optional(v.string()),
      reasoning: v.optional(v.string()),
      riskLevel: v.optional(riskLevelValidator),
    }),
    payload: v.optional(v.any()),
    expiresInMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const requestId = generateApprovalId();

    const requestDoc = await ctx.db.insert("approvalRequests", {
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      teamId: args.teamId,
      requestId,
      source: args.source,
      approvalType: args.approvalType,
      action: args.action,
      context: args.context,
      payload: args.payload,
      status: "pending",
      expiresAt: args.expiresInMs ? now + args.expiresInMs : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // Log event
    const event: Omit<ApprovalRequiredEvent, "eventId" | "timestamp"> = {
      type: "approval_required",
      orchestrationId: args.orchestrationId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      source: args.source,
      action: args.action,
      payload: {
        requestId,
        approvalType: args.approvalType,
        context: args.context,
      },
    };

    await ctx.db.insert("orchestrationEvents", {
      eventId: generateEventId(),
      orchestrationId: args.orchestrationId,
      eventType: "approval_required",
      teamId: args.teamId,
      taskId: args.taskId,
      taskRunId: args.taskRunId,
      payload: event,
      createdAt: now,
    });

    return { requestId, docId: requestDoc };
  },
});

/**
 * Resolve approval request internally (no auth).
 */
export const resolveRequestInternal = internalMutation({
  args: {
    requestId: v.string(),
    resolution: resolutionValidator,
    resolvedBy: v.optional(v.string()),
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();

    const request = await ctx.db
      .query("approvalRequests")
      .withIndex("by_request_id", (q) => q.eq("requestId", args.requestId))
      .first();

    if (!request) {
      throw new Error("Approval request not found");
    }

    if (request.status !== "pending") {
      throw new Error(`Cannot resolve: request is ${request.status}`);
    }

    const status =
      args.resolution === "allow" ||
      args.resolution === "allow_once" ||
      args.resolution === "allow_session"
        ? "approved"
        : "denied";

    await ctx.db.patch(request._id, {
      status,
      resolvedBy: args.resolvedBy ?? "system",
      resolvedAt: now,
      resolution: args.resolution,
      resolutionNote: args.note,
      updatedAt: now,
    });

    // Log event
    const event: Omit<ApprovalResolvedEvent, "eventId" | "timestamp"> = {
      type: "approval_resolved",
      orchestrationId: request.orchestrationId,
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      resolution: args.resolution,
    };

    await ctx.db.insert("orchestrationEvents", {
      eventId: generateEventId(),
      orchestrationId: request.orchestrationId,
      eventType: "approval_resolved",
      teamId: request.teamId,
      taskId: request.taskId,
      taskRunId: request.taskRunId,
      correlationId: args.requestId,
      payload: event,
      createdAt: now,
    });

    return { success: true, status };
  },
});

/**
 * Expire stale approval requests.
 * Called by cron to auto-expire requests past their deadline.
 */
export const expireStaleRequests = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();

    // Find pending requests with expired expiresAt
    const pendingRequests = await ctx.db
      .query("approvalRequests")
      .filter((q) => q.eq(q.field("status"), "pending"))
      .collect();

    let expiredCount = 0;
    for (const request of pendingRequests) {
      if (request.expiresAt && request.expiresAt < now) {
        await ctx.db.patch(request._id, {
          status: "expired",
          resolutionNote: "Auto-expired due to timeout",
          updatedAt: now,
        });
        expiredCount++;
      }
    }

    if (expiredCount > 0) {
      console.log(`[approvalBroker] Expired ${expiredCount} stale requests`);
    }
  },
});

// =============================================================================
// Internal Queries
// =============================================================================

/**
 * Check if there are any pending approvals blocking a task.
 */
export const hasPendingApprovals = internalQuery({
  args: {
    taskId: v.string(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("approvalRequests")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("status"), "pending"))
      .first();

    return !!pending;
  },
});

/**
 * Get count of pending approvals for a team.
 */
export const countPendingByTeam = internalQuery({
  args: {
    teamId: v.string(),
  },
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("approvalRequests")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "pending")
      )
      .collect();

    return pending.length;
  },
});
