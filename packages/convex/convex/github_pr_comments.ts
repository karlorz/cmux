"use node";
import { v } from "convex/values";
import { Octokit } from "octokit";
import { fetchInstallationAccessToken } from "../_shared/githubApp";
import { internalAction } from "./_generated/server";

function generate0githubUrl(prUrl: string): string {
  return prUrl.replace("github.com", "0github.com");
}

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

      const octokit = new Octokit({ auth: accessToken });
      const [owner, repo] = repoFullName.split("/");

      const response = await octokit.rest.reactions.createForIssue({
        owner,
        repo,
        issue_number: prNumber,
        content,
      });

      console.log("[github_pr_comments] Successfully added reaction", {
        installationId,
        repoFullName,
        prNumber,
        reactionId: response.data.id,
      });

      return { ok: true, reactionId: response.data.id };
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

export const addPrComment = internalAction({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
    prUrl: v.string(),
    screenshots: v.optional(v.array(v.string())),
  },
  handler: async (
    _ctx,
    { installationId, repoFullName, prNumber, prUrl, screenshots },
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

      // Build comment body
      const zeroGithubUrl = generate0githubUrl(prUrl);
      let commentBody = `[View on 0github](${zeroGithubUrl})`;

      // Add screenshots if provided
      if (screenshots && screenshots.length > 0) {
        commentBody += "\n\n## Screenshots\n\n";
        for (const screenshotUrl of screenshots) {
          commentBody += `![Screenshot](${screenshotUrl})\n\n`;
        }
      }

      const octokit = new Octokit({ auth: accessToken });
      const [owner, repo] = repoFullName.split("/");

      const response = await octokit.rest.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body: commentBody,
      });

      console.log("[github_pr_comments] Successfully added comment", {
        installationId,
        repoFullName,
        prNumber,
        commentId: response.data.id,
      });

      return { ok: true, commentId: response.data.id };
    } catch (error) {
      console.error(
        "[github_pr_comments] Unexpected error adding comment",
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
