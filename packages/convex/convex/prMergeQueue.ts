import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { getTeamId } from "../_shared/team";
import { authMutation, authQuery } from "./users/utils";

/**
 * Phase 3: PR Merge Queue
 *
 * Manages ordered, safe PR merging after swipe code review.
 * PRs are queued by risk score and position, then merged sequentially
 * after CI passes.
 */

/**
 * Add a PR to the merge queue.
 */
export const enqueue = authMutation({
  args: {
    teamSlugOrId: v.string(),
    repoFullName: v.string(),
    prNumber: v.number(),
    prUrl: v.string(),
    prTitle: v.optional(v.string()),
    sessionId: v.optional(v.id("prReviewSessions")),
    riskScore: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const userId = ctx.identity.subject;
    const now = Date.now();

    // Check if already queued
    const existing = await ctx.db
      .query("prMergeQueue")
      .withIndex("by_pr", (q) =>
        q.eq("repoFullName", args.repoFullName).eq("prNumber", args.prNumber)
      )
      .filter((q) =>
        q.and(
          q.neq(q.field("status"), "merged"),
          q.neq(q.field("status"), "cancelled"),
          q.neq(q.field("status"), "failed")
        )
      )
      .first();

    if (existing) {
      return { queueId: existing._id, alreadyQueued: true };
    }

    // Get current queue size for position
    const queuedItems = await ctx.db
      .query("prMergeQueue")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "queued")
      )
      .collect();

    const position = queuedItems.length;

    const queueId = await ctx.db.insert("prMergeQueue", {
      teamId,
      userId,
      repoFullName: args.repoFullName,
      prNumber: args.prNumber,
      prUrl: args.prUrl,
      prTitle: args.prTitle,
      sessionId: args.sessionId,
      status: "queued",
      position,
      riskScore: args.riskScore,
      createdAt: now,
      updatedAt: now,
    });

    return { queueId, alreadyQueued: false };
  },
});

/**
 * List PRs in the merge queue.
 */
export const list = authQuery({
  args: {
    teamSlugOrId: v.string(),
    status: v.optional(
      v.union(
        v.literal("queued"),
        v.literal("checks_pending"),
        v.literal("ready"),
        v.literal("merging"),
        v.literal("merged"),
        v.literal("failed"),
        v.literal("cancelled")
      )
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const limit = args.limit ?? 50;

    let items;
    if (args.status) {
      items = await ctx.db
        .query("prMergeQueue")
        .withIndex("by_team_status", (q) =>
          q.eq("teamId", teamId).eq("status", args.status!)
        )
        .order("asc")
        .take(limit);
    } else {
      // Get active queue items (not merged, cancelled, or failed)
      items = await ctx.db
        .query("prMergeQueue")
        .withIndex("by_team_status", (q) => q.eq("teamId", teamId))
        .filter((q) =>
          q.and(
            q.neq(q.field("status"), "merged"),
            q.neq(q.field("status"), "cancelled"),
            q.neq(q.field("status"), "failed")
          )
        )
        .take(limit);

      // Sort by position
      items.sort((a, b) => a.position - b.position);
    }

    return items;
  },
});

/**
 * Update queue item status.
 */
export const updateStatus = authMutation({
  args: {
    teamSlugOrId: v.string(),
    queueId: v.id("prMergeQueue"),
    status: v.union(
      v.literal("queued"),
      v.literal("checks_pending"),
      v.literal("ready"),
      v.literal("merging"),
      v.literal("merged"),
      v.literal("failed"),
      v.literal("cancelled")
    ),
    errorMessage: v.optional(v.string()),
    mergeCommitSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const item = await ctx.db.get(args.queueId);
    if (!item || item.teamId !== teamId) {
      throw new Error("Queue item not found");
    }

    const now = Date.now();
    const updates: Partial<typeof item> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.errorMessage !== undefined) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.status === "merged") {
      updates.mergedAt = now;
      if (args.mergeCommitSha) {
        updates.mergeCommitSha = args.mergeCommitSha;
      }
    }

    if (args.status === "ready") {
      updates.checksPassedAt = now;
    }

    await ctx.db.patch(args.queueId, updates);

    return { ok: true };
  },
});

/**
 * Remove a PR from the queue.
 */
export const cancel = authMutation({
  args: {
    teamSlugOrId: v.string(),
    queueId: v.id("prMergeQueue"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const item = await ctx.db.get(args.queueId);
    if (!item || item.teamId !== teamId) {
      throw new Error("Queue item not found");
    }

    if (item.status === "merged") {
      throw new Error("Cannot cancel already merged PR");
    }

    await ctx.db.patch(args.queueId, {
      status: "cancelled",
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Reorder queue (move item to new position).
 */
export const reorder = authMutation({
  args: {
    teamSlugOrId: v.string(),
    queueId: v.id("prMergeQueue"),
    newPosition: v.number(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const item = await ctx.db.get(args.queueId);
    if (!item || item.teamId !== teamId) {
      throw new Error("Queue item not found");
    }

    if (item.status !== "queued") {
      throw new Error("Can only reorder queued items");
    }

    const oldPosition = item.position;
    const newPosition = args.newPosition;

    if (oldPosition === newPosition) {
      return { ok: true };
    }

    // Get all queued items
    const queuedItems = await ctx.db
      .query("prMergeQueue")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", teamId).eq("status", "queued")
      )
      .collect();

    // Update positions
    for (const queueItem of queuedItems) {
      let newPos = queueItem.position;

      if (queueItem._id === args.queueId) {
        newPos = newPosition;
      } else if (oldPosition < newPosition) {
        // Moving down: shift items up
        if (
          queueItem.position > oldPosition &&
          queueItem.position <= newPosition
        ) {
          newPos = queueItem.position - 1;
        }
      } else {
        // Moving up: shift items down
        if (
          queueItem.position >= newPosition &&
          queueItem.position < oldPosition
        ) {
          newPos = queueItem.position + 1;
        }
      }

      if (newPos !== queueItem.position) {
        await ctx.db.patch(queueItem._id, {
          position: newPos,
          updatedAt: Date.now(),
        });
      }
    }

    return { ok: true };
  },
});

/**
 * Internal: Get next PR ready to merge.
 */
export const getNextReadyToMerge = internalQuery({
  args: { teamId: v.string() },
  handler: async (ctx, args) => {
    // Find first item with status "ready"
    const readyItem = await ctx.db
      .query("prMergeQueue")
      .withIndex("by_team_status", (q) =>
        q.eq("teamId", args.teamId).eq("status", "ready")
      )
      .order("asc")
      .first();

    return readyItem;
  },
});

/**
 * Internal: Update merge status after GitHub API call.
 */
export const internalUpdateStatus = internalMutation({
  args: {
    queueId: v.id("prMergeQueue"),
    status: v.union(
      v.literal("merging"),
      v.literal("merged"),
      v.literal("failed")
    ),
    errorMessage: v.optional(v.string()),
    mergeCommitSha: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.queueId);
    if (!item) return;

    const now = Date.now();
    const updates: Partial<typeof item> = {
      status: args.status,
      updatedAt: now,
    };

    if (args.errorMessage) {
      updates.errorMessage = args.errorMessage;
    }

    if (args.status === "merged") {
      updates.mergedAt = now;
      if (args.mergeCommitSha) {
        updates.mergeCommitSha = args.mergeCommitSha;
      }
    }

    await ctx.db.patch(args.queueId, updates);
  },
});
