"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Process pending preview screenshot jobs
 * This action is scheduled to run periodically
 */
export const processPendingJobs = internalAction({
  args: {},
  handler: async (ctx) => {
    // Get all pending jobs
    const pendingJobs = await ctx.runQuery(internal.preview.listPendingJobs, {});

    if (pendingJobs.length === 0) {
      console.log("[preview_worker] No pending jobs");
      return { processed: 0 };
    }

    console.log(`[preview_worker] Found ${pendingJobs.length} pending jobs`);

    // Process each job (limit to 5 concurrent jobs)
    const jobsToProcess = pendingJobs.slice(0, 5);

    await Promise.all(
      jobsToProcess.map((job) =>
        ctx.runAction(internal.preview_worker.processJob, {
          jobId: job._id,
        })
      )
    );

    return { processed: jobsToProcess.length };
  },
});

/**
 * Process a single preview screenshot job
 */
export const processJob = internalAction({
  args: {
    jobId: v.id("previewScreenshotJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.preview.getScreenshotJob, {
      jobId: args.jobId,
    });

    if (!job) {
      console.error("[preview_worker] Job not found", { jobId: args.jobId });
      return;
    }

    if (job.status !== "pending") {
      console.log("[preview_worker] Job already processed", {
        jobId: args.jobId,
        status: job.status,
      });
      return;
    }

    console.log("[preview_worker] Processing job", {
      jobId: args.jobId,
      repoFullName: job.repoFullName,
      pullRequestNumber: job.pullRequestNumber,
    });

    // Mark job as running
    await ctx.runMutation(internal.preview.updateScreenshotJob, {
      jobId: args.jobId,
      status: "running",
      startedAt: Date.now(),
    });

    try {
      // Get the configuration
      const config = await ctx.runQuery(
        internal.preview.getConfigurationByRepo,
        {
          teamId: job.teamId,
          repoFullName: job.repoFullName,
        }
      );

      if (!config) {
        throw new Error("Configuration not found");
      }

      // Fetch PR metadata and git diff from GitHub
      const { changedFiles, gitDiff } = await fetchPRDiff(
        config.installationId,
        job.repoFullName,
        job.pullRequestNumber
      );

      // Update job with changed files and git diff
      await ctx.runMutation(internal.preview.updateScreenshotJob, {
        jobId: args.jobId,
        changedFiles,
        gitDiff,
      });

      // Start Morph sandbox with repo cloned
      const sandbox = await startPreviewSandbox({
        teamId: job.teamId,
        repoFullName: job.repoFullName,
        branch: job.headBranch,
        config,
        jobId: args.jobId,
      });

      // Update job with sandbox info
      await ctx.runMutation(internal.preview.updateScreenshotJob, {
        jobId: args.jobId,
        sandboxInstanceId: sandbox.instanceId,
        vscodeUrl: sandbox.vscodeUrl,
      });

      // Run browser agent to capture screenshots
      const screenshots = await captureScreenshots({
        instanceId: sandbox.instanceId,
        workspaceDir: `/root/workspace/${job.repoFullName.split("/")[1]}`,
        changedFiles,
        prTitle: job.pullRequestTitle || "",
        prDescription: job.pullRequestDescription || "",
        branch: job.headBranch,
        config,
      });

      // Upload screenshots to Convex storage
      const storageIds = await uploadScreenshots(ctx, screenshots);

      // Update job with screenshot results
      await ctx.runMutation(internal.preview.updateScreenshotJob, {
        jobId: args.jobId,
        screenshotStorageIds: storageIds,
        screenshotCount: storageIds.length,
        status: "completed",
        completedAt: Date.now(),
      });

      // Comment on GitHub PR
      await ctx.runAction(internal.preview_worker.commentOnPR, {
        jobId: args.jobId,
      });

      console.log("[preview_worker] Job completed successfully", {
        jobId: args.jobId,
        screenshotCount: storageIds.length,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      console.error("[preview_worker] Job failed", {
        jobId: args.jobId,
        error: errorMessage,
      });

      await ctx.runMutation(internal.preview.updateScreenshotJob, {
        jobId: args.jobId,
        status: "failed",
        errorMessage,
        completedAt: Date.now(),
      });
    }
  },
});

/**
 * Comment on GitHub PR with screenshots
 */
export const commentOnPR = internalAction({
  args: {
    jobId: v.id("previewScreenshotJobs"),
  },
  handler: async (ctx, args) => {
    const job = await ctx.runQuery(internal.preview.getScreenshotJob, {
      jobId: args.jobId,
    });

    if (!job) {
      console.error("[preview_worker] Job not found for commenting", {
        jobId: args.jobId,
      });
      return;
    }

    const config = await ctx.runQuery(internal.preview.getConfigurationByRepo, {
      teamId: job.teamId,
      repoFullName: job.repoFullName,
    });

    if (!config) {
      console.error("[preview_worker] Config not found for commenting", {
        jobId: args.jobId,
      });
      return;
    }

    // Create comment body with screenshots
    const screenshotUrls =
      job.screenshotStorageIds?.map((id) => {
        return `https://www.cmux.dev/api/storage/${id}`;
      }) || [];

    const commentBody = `## 📸 Preview Screenshots

${job.screenshotCount || 0} screenshot(s) captured for this PR.

${screenshotUrls.map((url, i) => `![Screenshot ${i + 1}](${url})`).join("\n\n")}

---
Generated by [cmux preview](https://www.cmux.dev/preview)`;

    // Post comment to GitHub
    try {
      const commentResult = await postGitHubComment(
        config.installationId,
        job.repoFullName,
        job.pullRequestNumber,
        commentBody
      );

      // Update job with comment info
      await ctx.runMutation(internal.preview.updateScreenshotJob, {
        jobId: args.jobId,
        githubCommentId: commentResult.id,
        githubCommentUrl: commentResult.html_url,
      });

      console.log("[preview_worker] Posted comment to PR", {
        jobId: args.jobId,
        commentId: commentResult.id,
      });
    } catch (error) {
      console.error("[preview_worker] Failed to post comment", {
        jobId: args.jobId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },
});

// Helper functions (will be implemented)

async function fetchPRDiff(
  installationId: number,
  repoFullName: string,
  prNumber: number
): Promise<{ changedFiles: string[]; gitDiff: string }> {
  // Implementation will use GitHub API via Octokit
  // This is a placeholder
  return {
    changedFiles: [],
    gitDiff: "",
  };
}

interface SandboxConfig {
  teamId: string;
  repoFullName: string;
  branch: string;
  config: any;
  jobId: string;
}

async function startPreviewSandbox(
  config: SandboxConfig
): Promise<{ instanceId: string; vscodeUrl: string; workerUrl: string }> {
  // Implementation will use Morph API
  // This is a placeholder
  return {
    instanceId: "",
    vscodeUrl: "",
    workerUrl: "",
  };
}

interface CaptureConfig {
  instanceId: string;
  workspaceDir: string;
  changedFiles: string[];
  prTitle: string;
  prDescription: string;
  branch: string;
  config: any;
}

async function captureScreenshots(
  config: CaptureConfig
): Promise<Buffer[]> {
  // Implementation will use the existing Claude screenshot collector
  // This is a placeholder
  return [];
}

async function uploadScreenshots(
  ctx: any,
  screenshots: Buffer[]
): Promise<Array<any>> {
  // Implementation will upload to Convex storage
  // This is a placeholder
  return [];
}

async function postGitHubComment(
  installationId: number,
  repoFullName: string,
  prNumber: number,
  body: string
): Promise<{ id: number; html_url: string }> {
  // Implementation will use GitHub API
  // This is a placeholder
  return {
    id: 0,
    html_url: "",
  };
}
