"use node";
import { v } from "convex/values";
import { fetchInstallationAccessToken } from "../_shared/githubApp";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, query } from "./_generated/server";

export const addPrReaction = internalAction({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    content: v.literal("eyes"),
  },
  handler: async (
    _ctx,
    { installationId, repoFullName, prNumber, content },
  ) => {
    try {
      const accessToken = await fetchInstallationAccessToken(installationId);
      if (!accessToken) {
        console.error(
          "[github_pr_comments] Failed to get access token for installation",
          { installationId },
        );
        return { ok: false, error: "Failed to get access token" };
      }

      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/reactions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "cmux-github-bot",
          },
          body: JSON.stringify({ content }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error(
          "[github_pr_comments] Failed to add reaction",
          {
            installationId,
            repoFullName,
            prNumber,
            status: response.status,
            error: errorText,
          },
        );
        return {
          ok: false,
          error: `GitHub API error: ${response.status}`,
        };
      }

      const data = await response.json();
      console.log("[github_pr_comments] Successfully added reaction", {
        installationId,
        repoFullName,
        prNumber,
        reactionId: data.id,
      });

      return { ok: true, reactionId: data.id };
    } catch (error) {
      console.error(
        "[github_pr_comments] Unexpected error adding reaction",
        {
          installationId,
          repoFullName,
          prNumber,
          error,
        },
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});

// Query to get issue comments for a PR
export const listIssueComments = query({
  args: {
    pullRequestId: v.id("pullRequests"),
  },
  handler: async (ctx, { pullRequestId }) => {
    const comments = await ctx.db
      .query("githubPrComments")
      .withIndex("by_pr", (q) => q.eq("pullRequestId", pullRequestId))
      .order("asc")
      .collect();
    return comments;
  },
});

// Query to get review comments for a PR
export const listReviewComments = query({
  args: {
    pullRequestId: v.id("pullRequests"),
  },
  handler: async (ctx, { pullRequestId }) => {
    const comments = await ctx.db
      .query("githubPrReviewComments")
      .withIndex("by_pr", (q) => q.eq("pullRequestId", pullRequestId))
      .order("asc")
      .collect();
    return comments;
  },
});

// Query to get all comments (both types) for a PR
export const listAllComments = query({
  args: {
    pullRequestId: v.id("pullRequests"),
  },
  handler: async (ctx, { pullRequestId }) => {
    const [issueComments, reviewComments] = await Promise.all([
      ctx.db
        .query("githubPrComments")
        .withIndex("by_pr", (q) => q.eq("pullRequestId", pullRequestId))
        .order("asc")
        .collect(),
      ctx.db
        .query("githubPrReviewComments")
        .withIndex("by_pr", (q) => q.eq("pullRequestId", pullRequestId))
        .order("asc")
        .collect(),
    ]);

    return {
      issueComments,
      reviewComments,
    };
  },
});

// Internal mutation to upsert issue comment from webhook
export const upsertIssueComment = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    comment: v.any(),
    action: v.union(
      v.literal("created"),
      v.literal("edited"),
      v.literal("deleted"),
    ),
  },
  handler: async (
    ctx,
    { installationId, repoFullName, prNumber, comment, action },
  ) => {
    // Find the PR
    const connection = await ctx.db
      .query("providerConnections")
      .filter((q) => q.eq(q.field("installationId"), installationId))
      .first();

    if (!connection || !connection.teamId) {
      console.error(
        "[github_pr_comments] No connection found for installation",
        { installationId },
      );
      return;
    }

    const pr = await ctx.db
      .query("pullRequests")
      .withIndex("by_team_repo_number", (q) =>
        q
          .eq("teamId", connection.teamId as string)
          .eq("repoFullName", repoFullName)
          .eq("number", prNumber),
      )
      .first();

    if (!pr) {
      console.error("[github_pr_comments] PR not found", {
        teamId: connection.teamId,
        repoFullName,
        prNumber,
      });
      return;
    }

    if (action === "deleted") {
      // Delete the comment
      const existingComment = await ctx.db
        .query("githubPrComments")
        .withIndex("by_comment_id", (q) => q.eq("commentId", comment.id))
        .first();
      if (existingComment) {
        await ctx.db.delete(existingComment._id);
      }
      return;
    }

    // Upsert the comment
    const existingComment = await ctx.db
      .query("githubPrComments")
      .withIndex("by_comment_id", (q) => q.eq("commentId", comment.id))
      .first();

    const commentData = {
      provider: "github" as const,
      installationId,
      repoFullName,
      prNumber,
      commentId: comment.id,
      teamId: connection.teamId,
      pullRequestId: pr._id,
      body: comment.body ?? "",
      htmlUrl: comment.html_url,
      authorLogin: comment.user?.login,
      authorId: comment.user?.id,
      authorAvatarUrl: comment.user?.avatar_url,
      createdAt: comment.created_at
        ? new Date(comment.created_at).getTime()
        : undefined,
      updatedAt: comment.updated_at
        ? new Date(comment.updated_at).getTime()
        : undefined,
      reactions: comment.reactions
        ? {
            totalCount: comment.reactions.total_count ?? 0,
            plusOne: comment.reactions["+1"] ?? 0,
            minusOne: comment.reactions["-1"] ?? 0,
            laugh: comment.reactions.laugh ?? 0,
            hooray: comment.reactions.hooray ?? 0,
            confused: comment.reactions.confused ?? 0,
            heart: comment.reactions.heart ?? 0,
            rocket: comment.reactions.rocket ?? 0,
            eyes: comment.reactions.eyes ?? 0,
          }
        : undefined,
    };

    if (existingComment) {
      await ctx.db.patch(existingComment._id, commentData);
    } else {
      await ctx.db.insert("githubPrComments", commentData);
    }
  },
});

// Internal mutation to upsert review comment from webhook
export const upsertReviewComment = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    comment: v.any(),
    action: v.union(
      v.literal("created"),
      v.literal("edited"),
      v.literal("deleted"),
    ),
  },
  handler: async (
    ctx,
    { installationId, repoFullName, prNumber, comment, action },
  ) => {
    // Find the PR
    const connection = await ctx.db
      .query("providerConnections")
      .filter((q) => q.eq(q.field("installationId"), installationId))
      .first();

    if (!connection || !connection.teamId) {
      console.error(
        "[github_pr_comments] No connection found for installation",
        { installationId },
      );
      return;
    }

    const pr = await ctx.db
      .query("pullRequests")
      .withIndex("by_team_repo_number", (q) =>
        q
          .eq("teamId", connection.teamId as string)
          .eq("repoFullName", repoFullName)
          .eq("number", prNumber),
      )
      .first();

    if (!pr) {
      console.error("[github_pr_comments] PR not found", {
        teamId: connection.teamId,
        repoFullName,
        prNumber,
      });
      return;
    }

    if (action === "deleted") {
      // Delete the comment
      const existingComment = await ctx.db
        .query("githubPrReviewComments")
        .withIndex("by_comment_id", (q) => q.eq("commentId", comment.id))
        .first();
      if (existingComment) {
        await ctx.db.delete(existingComment._id);
      }
      return;
    }

    // Upsert the comment
    const existingComment = await ctx.db
      .query("githubPrReviewComments")
      .withIndex("by_comment_id", (q) => q.eq("commentId", comment.id))
      .first();

    const commentData = {
      provider: "github" as const,
      installationId,
      repoFullName,
      prNumber,
      commentId: comment.id,
      reviewId: comment.pull_request_review_id,
      teamId: connection.teamId,
      pullRequestId: pr._id,
      body: comment.body ?? "",
      htmlUrl: comment.html_url,
      path: comment.path,
      commitId: comment.commit_id,
      originalCommitId: comment.original_commit_id,
      diffHunk: comment.diff_hunk,
      position: comment.position,
      originalPosition: comment.original_position,
      line: comment.line,
      originalLine: comment.original_line,
      side: comment.side,
      startLine: comment.start_line,
      startSide: comment.start_side,
      inReplyToId: comment.in_reply_to_id,
      authorLogin: comment.user?.login,
      authorId: comment.user?.id,
      authorAvatarUrl: comment.user?.avatar_url,
      createdAt: comment.created_at
        ? new Date(comment.created_at).getTime()
        : undefined,
      updatedAt: comment.updated_at
        ? new Date(comment.updated_at).getTime()
        : undefined,
      reactions: comment.reactions
        ? {
            totalCount: comment.reactions.total_count ?? 0,
            plusOne: comment.reactions["+1"] ?? 0,
            minusOne: comment.reactions["-1"] ?? 0,
            laugh: comment.reactions.laugh ?? 0,
            hooray: comment.reactions.hooray ?? 0,
            confused: comment.reactions.confused ?? 0,
            heart: comment.reactions.heart ?? 0,
            rocket: comment.reactions.rocket ?? 0,
            eyes: comment.reactions.eyes ?? 0,
          }
        : undefined,
    };

    if (existingComment) {
      await ctx.db.patch(existingComment._id, commentData);
    } else {
      await ctx.db.insert("githubPrReviewComments", commentData);
    }
  },
});

// Action to backfill comments from GitHub API
export const backfillComments = internalAction({
  args: {
    pullRequestId: v.id("pullRequests"),
  },
  handler: async (ctx, { pullRequestId }) => {
    // Get the PR details
    const pr = await ctx.runQuery(internal.github_prs.getPullRequestInternal, {
      pullRequestId,
    });

    if (!pr) {
      console.error("[github_pr_comments] PR not found for backfill", {
        pullRequestId,
      });
      return { ok: false, error: "PR not found" };
    }

    try {
      const accessToken = await fetchInstallationAccessToken(
        pr.installationId,
      );
      if (!accessToken) {
        console.error(
          "[github_pr_comments] Failed to get access token for backfill",
          { installationId: pr.installationId },
        );
        return { ok: false, error: "Failed to get access token" };
      }

      // Fetch issue comments
      const issueCommentsResponse = await fetch(
        `https://api.github.com/repos/${pr.repoFullName}/issues/${pr.number}/comments`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "cmux-github-bot",
          },
        },
      );

      if (!issueCommentsResponse.ok) {
        console.error(
          "[github_pr_comments] Failed to fetch issue comments",
          {
            status: issueCommentsResponse.status,
            error: await issueCommentsResponse.text(),
          },
        );
      } else {
        const issueComments = await issueCommentsResponse.json();
        for (const comment of issueComments) {
          await ctx.runMutation(internal.github_pr_comments.upsertIssueComment, {
            installationId: pr.installationId,
            repoFullName: pr.repoFullName,
            prNumber: pr.number,
            comment,
            action: "created",
          });
        }
      }

      // Fetch review comments
      const reviewCommentsResponse = await fetch(
        `https://api.github.com/repos/${pr.repoFullName}/pulls/${pr.number}/comments`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "cmux-github-bot",
          },
        },
      );

      if (!reviewCommentsResponse.ok) {
        console.error(
          "[github_pr_comments] Failed to fetch review comments",
          {
            status: reviewCommentsResponse.status,
            error: await reviewCommentsResponse.text(),
          },
        );
      } else {
        const reviewComments = await reviewCommentsResponse.json();
        for (const comment of reviewComments) {
          await ctx.runMutation(
            internal.github_pr_comments.upsertReviewComment,
            {
              installationId: pr.installationId,
              repoFullName: pr.repoFullName,
              prNumber: pr.number,
              comment,
              action: "created",
            },
          );
        }
      }

      return { ok: true };
    } catch (error) {
      console.error(
        "[github_pr_comments] Error during comment backfill",
        error,
      );
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
