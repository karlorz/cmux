import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
} from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Phase 3: Swipe Code Review - Review Session Management
 *
 * Tracks per-file review decisions (approve/reject) for PR reviews.
 * Supports undo stack and batch operations.
 */

// Review decision type
const reviewDecisionValidator = v.union(
  v.literal("pending"),
  v.literal("approved"),
  v.literal("changes_requested"),
  v.literal("skipped")
);

/**
 * Create a new review session for a PR or task run.
 */
export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    // Link to either a task run or external PR
    taskRunId: v.optional(v.id("taskRuns")),
    // External PR info (when not linked to a task run)
    repoFullName: v.optional(v.string()),
    prNumber: v.optional(v.number()),
    prUrl: v.optional(v.string()),
    // Heatmap data
    heatmapData: v.optional(v.string()), // JSON string of PRHeatmapResult
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    // If linked to a task run, get PR info from there
    let repoFullName = args.repoFullName;
    let prNumber = args.prNumber;
    let prUrl = args.prUrl;

    if (args.taskRunId) {
      const taskRun = await ctx.db.get(args.taskRunId);
      if (!taskRun || taskRun.teamId !== teamId) {
        throw new Error("Task run not found");
      }
      const pr = taskRun.pullRequests?.[0];
      if (pr) {
        repoFullName = repoFullName ?? pr.repoFullName;
        prNumber = prNumber ?? pr.number;
        prUrl = prUrl ?? pr.url;
      }
    }

    const sessionId = await ctx.db.insert("prReviewSessions", {
      teamId,
      userId,
      taskRunId: args.taskRunId,
      repoFullName,
      prNumber,
      prUrl,
      status: "in_progress",
      totalFiles: 0,
      reviewedFiles: 0,
      approvedFiles: 0,
      changesRequestedFiles: 0,
      heatmapData: args.heatmapData,
      createdAt: now,
      updatedAt: now,
    });

    return { sessionId };
  },
});

/**
 * Get a review session by ID.
 */
export const get = authQuery({
  args: {
    teamSlugOrId: v.string(),
    sessionId: v.id("prReviewSessions"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const session = await ctx.db.get(args.sessionId);

    if (!session || session.teamId !== teamId) {
      return null;
    }

    // Get all file decisions for this session
    const fileDecisions = await ctx.db
      .query("prReviewFileDecisions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return {
      ...session,
      fileDecisions,
    };
  },
});

/**
 * List review sessions for a team.
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    limit: v.optional(v.number()),
    status: v.optional(
      v.union(
        v.literal("in_progress"),
        v.literal("completed"),
        v.literal("abandoned")
      )
    ),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const limit = args.limit ?? 20;

    let query = ctx.db
      .query("prReviewSessions")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId)
      );

    const sessions = await query.order("desc").take(limit);

    // Filter by status if provided
    if (args.status) {
      return sessions.filter((s) => s.status === args.status);
    }

    return sessions;
  },
});

/**
 * Record a file review decision.
 */
export const recordFileDecision = authMutation({
  args: {
    teamSlugOrId: v.string(),
    sessionId: v.id("prReviewSessions"),
    filePath: v.string(),
    decision: reviewDecisionValidator,
    comment: v.optional(v.string()),
    // Heatmap data for this file
    riskScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.teamId !== teamId || session.userId !== userId) {
      throw new Error("Session not found or unauthorized");
    }

    // Check for existing decision
    const existing = await ctx.db
      .query("prReviewFileDecisions")
      .withIndex("by_session_file", (q) =>
        q.eq("sessionId", args.sessionId).eq("filePath", args.filePath)
      )
      .first();

    if (existing) {
      // Store previous decision in undo stack
      const undoStack = existing.undoStack ?? [];
      undoStack.push({
        decision: existing.decision,
        comment: existing.comment,
        timestamp: existing.updatedAt,
      });

      await ctx.db.patch(existing._id, {
        decision: args.decision,
        comment: args.comment,
        riskScore: args.riskScore ?? existing.riskScore,
        undoStack,
        updatedAt: now,
      });

      // Update session counts
      await updateSessionCounts(ctx as unknown as MutationCtx, args.sessionId);

      return { decisionId: existing._id, updated: true };
    }

    // Create new decision
    const decisionId = await ctx.db.insert("prReviewFileDecisions", {
      sessionId: args.sessionId,
      filePath: args.filePath,
      decision: args.decision,
      comment: args.comment,
      riskScore: args.riskScore,
      undoStack: [],
      createdAt: now,
      updatedAt: now,
    });

    // Update session counts
    await updateSessionCounts(ctx as unknown as MutationCtx, args.sessionId);

    return { decisionId, updated: false };
  },
});

/**
 * Undo the last decision for a file.
 */
export const undoFileDecision = authMutation({
  args: {
    teamSlugOrId: v.string(),
    sessionId: v.id("prReviewSessions"),
    filePath: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.teamId !== teamId || session.userId !== userId) {
      throw new Error("Session not found or unauthorized");
    }

    const decision = await ctx.db
      .query("prReviewFileDecisions")
      .withIndex("by_session_file", (q) =>
        q.eq("sessionId", args.sessionId).eq("filePath", args.filePath)
      )
      .first();

    if (!decision || !decision.undoStack?.length) {
      return { ok: false, reason: "No undo history" };
    }

    // Pop the last decision from undo stack
    const undoStack = [...decision.undoStack];
    const previousState = undoStack.pop()!;

    await ctx.db.patch(decision._id, {
      decision: previousState.decision as Doc<"prReviewFileDecisions">["decision"],
      comment: previousState.comment,
      undoStack,
      updatedAt: now,
    });

    // Update session counts
    await updateSessionCounts(ctx as unknown as MutationCtx, args.sessionId);

    return { ok: true };
  },
});

/**
 * Batch approve/reject all remaining files.
 */
export const batchDecision = authMutation({
  args: {
    teamSlugOrId: v.string(),
    sessionId: v.id("prReviewSessions"),
    decision: reviewDecisionValidator,
    // Only apply to files matching these criteria
    onlyPending: v.optional(v.boolean()),
    maxRiskScore: v.optional(v.number()), // Only batch files with risk <= this
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.teamId !== teamId || session.userId !== userId) {
      throw new Error("Session not found or unauthorized");
    }

    // Get existing decisions
    const existingDecisions = await ctx.db
      .query("prReviewFileDecisions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const existingByPath = new Map(
      existingDecisions.map((d) => [d.filePath, d])
    );

    // Parse heatmap to get file list
    let files: Array<{ path: string; riskScore?: number }> = [];
    if (session.heatmapData) {
      try {
        const heatmap = JSON.parse(session.heatmapData);
        files = heatmap.files?.map((f: { path: string; heatmap?: { overallRiskScore?: number } }) => ({
          path: f.path,
          riskScore: f.heatmap?.overallRiskScore,
        })) ?? [];
      } catch {
        // Invalid heatmap data, skip
      }
    }

    let updated = 0;
    for (const file of files) {
      const existing = existingByPath.get(file.path);

      // Skip if only pending and already has a non-pending decision
      if (args.onlyPending && existing?.decision !== "pending") {
        continue;
      }

      // Skip if risk score filter doesn't match
      if (
        args.maxRiskScore !== undefined &&
        file.riskScore !== undefined &&
        file.riskScore > args.maxRiskScore
      ) {
        continue;
      }

      if (existing) {
        // Update existing
        const undoStack = existing.undoStack ?? [];
        undoStack.push({
          decision: existing.decision,
          comment: existing.comment,
          timestamp: existing.updatedAt,
        });

        await ctx.db.patch(existing._id, {
          decision: args.decision,
          undoStack,
          updatedAt: now,
        });
      } else {
        // Create new
        await ctx.db.insert("prReviewFileDecisions", {
          sessionId: args.sessionId,
          filePath: file.path,
          decision: args.decision,
          riskScore: file.riskScore,
          undoStack: [],
          createdAt: now,
          updatedAt: now,
        });
      }
      updated++;
    }

    // Update session counts
    await updateSessionCounts(ctx as unknown as MutationCtx, args.sessionId);

    return { updated };
  },
});

/**
 * Complete a review session.
 */
export const complete = authMutation({
  args: {
    teamSlugOrId: v.string(),
    sessionId: v.id("prReviewSessions"),
    submitToGitHub: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.teamId !== teamId || session.userId !== userId) {
      throw new Error("Session not found or unauthorized");
    }

    await ctx.db.patch(args.sessionId, {
      status: "completed",
      completedAt: now,
      updatedAt: now,
    });

    // TODO: If submitToGitHub, schedule action to post review to GitHub

    return { ok: true };
  },
});

/**
 * Helper to update session file counts.
 */
async function updateSessionCounts(
  ctx: MutationCtx,
  sessionId: Id<"prReviewSessions">
) {
  const decisions = await ctx.db
    .query("prReviewFileDecisions")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();

  const counts = {
    totalFiles: decisions.length,
    reviewedFiles: decisions.filter((d) => d.decision !== "pending").length,
    approvedFiles: decisions.filter((d) => d.decision === "approved").length,
    changesRequestedFiles: decisions.filter(
      (d) => d.decision === "changes_requested"
    ).length,
  };

  await ctx.db.patch(sessionId, {
    ...counts,
    updatedAt: Date.now(),
  });
}

/**
 * Internal query to get session for GitHub posting.
 */
export const getSessionForGitHub = internalQuery({
  args: { sessionId: v.id("prReviewSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const decisions = await ctx.db
      .query("prReviewFileDecisions")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    return { session, decisions };
  },
});
