"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { fetchInstallationAccessToken } from "../_shared/githubApp";

/**
 * Phase 3: Swipe Code Review - GitHub Integration Actions
 *
 * These actions handle posting review results to GitHub PRs.
 */

/**
 * Submit review to GitHub PR.
 * Posts a review with file-level comments based on review decisions.
 */
export const submitReviewToGitHub = internalAction({
  args: {
    sessionId: v.id("prReviewSessions"),
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    reviewEvent: v.union(
      v.literal("APPROVE"),
      v.literal("REQUEST_CHANGES"),
      v.literal("COMMENT")
    ),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; reviewId?: number; error?: string }> => {
    console.log("[prReviewSessions] Submitting review to GitHub", {
      sessionId: args.sessionId,
      repoFullName: args.repoFullName,
      prNumber: args.prNumber,
    });

    // Get session and decisions
    const sessionData = await ctx.runQuery(
      internal.prReviewSessions.getSessionForGitHub,
      { sessionId: args.sessionId }
    );

    if (!sessionData) {
      return { ok: false, error: "Session not found" };
    }

    const { session, decisions } = sessionData;

    try {
      // Get GitHub access token
      const accessToken = await fetchInstallationAccessToken(args.installationId);
      if (!accessToken) {
        return { ok: false, error: "Failed to get GitHub access token" };
      }

      // Build review body
      const approvedCount = decisions.filter((d) => d.decision === "approved").length;
      const changesCount = decisions.filter((d) => d.decision === "changes_requested").length;
      const skippedCount = decisions.filter((d) => d.decision === "skipped").length;
      const totalFiles = decisions.length;

      let body = `## Code Review Summary\n\n`;
      body += `| Status | Count |\n|--------|-------|\n`;
      body += `| Approved | ${approvedCount} |\n`;
      body += `| Changes Requested | ${changesCount} |\n`;
      body += `| Skipped | ${skippedCount} |\n`;
      body += `| Total Files | ${totalFiles} |\n\n`;

      // Add files with changes requested
      const filesWithChanges = decisions.filter(
        (d) => d.decision === "changes_requested" && d.comment
      );

      if (filesWithChanges.length > 0) {
        body += `### Files Requiring Changes\n\n`;
        for (const file of filesWithChanges) {
          body += `**\`${file.filePath}\`**\n`;
          if (file.comment) {
            body += `> ${file.comment}\n`;
          }
          body += `\n`;
        }
      }

      // Determine review event based on decisions
      let event = args.reviewEvent;
      if (event === "APPROVE" && changesCount > 0) {
        // Override to request changes if any files have changes requested
        event = "REQUEST_CHANGES";
      }

      // Submit review via GitHub API
      const [owner, repo] = args.repoFullName.split("/");
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${args.prNumber}/reviews`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            body,
            event,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[prReviewSessions] GitHub API error", {
          status: response.status,
          error: errorText,
        });
        return { ok: false, error: `GitHub API error: ${response.status}` };
      }

      const reviewData = (await response.json()) as { id: number };

      console.log("[prReviewSessions] Review submitted successfully", {
        reviewId: reviewData.id,
      });

      return { ok: true, reviewId: reviewData.id };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[prReviewSessions] Failed to submit review", {
        error: errorMessage,
      });
      return { ok: false, error: errorMessage };
    }
  },
});

/**
 * Merge a PR via GitHub API.
 * Used by the merge queue to execute merges.
 */
export const mergePullRequest = internalAction({
  args: {
    queueId: v.id("prMergeQueue"),
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    mergeMethod: v.optional(v.union(v.literal("merge"), v.literal("squash"), v.literal("rebase"))),
  },
  handler: async (ctx, args): Promise<{ ok: boolean; sha?: string; error?: string }> => {
    console.log("[prMergeQueue] Merging PR", {
      queueId: args.queueId,
      repoFullName: args.repoFullName,
      prNumber: args.prNumber,
    });

    // Set status to merging
    await ctx.runMutation(internal.prMergeQueue.internalUpdateStatus, {
      queueId: args.queueId,
      status: "merging",
    });

    try {
      // Get GitHub access token
      const accessToken = await fetchInstallationAccessToken(args.installationId);
      if (!accessToken) {
        return { ok: false, error: "Failed to get GitHub access token" };
      }

      const [owner, repo] = args.repoFullName.split("/");
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/pulls/${args.prNumber}/merge`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github.v3+json",
            "Content-Type": "application/json",
            "X-GitHub-Api-Version": "2022-11-28",
          },
          body: JSON.stringify({
            merge_method: args.mergeMethod ?? "squash",
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[prMergeQueue] GitHub merge error", {
          status: response.status,
          error: errorText,
        });

        await ctx.runMutation(internal.prMergeQueue.internalUpdateStatus, {
          queueId: args.queueId,
          status: "failed",
          errorMessage: `GitHub API error: ${response.status}`,
        });

        return { ok: false, error: `GitHub API error: ${response.status}` };
      }

      const mergeData = (await response.json()) as { sha: string };

      // Update status to merged
      await ctx.runMutation(internal.prMergeQueue.internalUpdateStatus, {
        queueId: args.queueId,
        status: "merged",
        mergeCommitSha: mergeData.sha,
      });

      console.log("[prMergeQueue] PR merged successfully", {
        sha: mergeData.sha,
      });

      return { ok: true, sha: mergeData.sha };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error("[prMergeQueue] Failed to merge PR", {
        error: errorMessage,
      });

      await ctx.runMutation(internal.prMergeQueue.internalUpdateStatus, {
        queueId: args.queueId,
        status: "failed",
        errorMessage,
      });

      return { ok: false, error: errorMessage };
    }
  },
});
