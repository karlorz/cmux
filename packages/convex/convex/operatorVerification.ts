import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, internalQuery } from "./_generated/server";

/**
 * Phase 2: Operator Visual Verification
 *
 * After a coding agent completes a task run with PR(s), this module triggers
 * screenshot collection in the sandbox and posts the results to GitHub.
 *
 * Flow:
 * 1. Task run completes with status="completed" and has pullRequests
 * 2. updateStatus schedules triggerOperatorVerification
 * 3. triggerOperatorVerification checks if sandbox is still running
 * 4. If running, calls sandbox worker to start screenshot collection
 * 5. Worker runs screenshot collection and POSTs results back to Convex
 * 6. Results are stored and posted to GitHub PR as a comment
 */

/**
 * Check if operator verification should run for this task run.
 * Returns true if:
 * - Run has at least one pull request
 * - Sandbox is still running (vscode.status === "running")
 * - Operator verification hasn't already run
 */
export const shouldTriggerVerification = internalQuery({
  args: { taskRunId: v.id("taskRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      return { shouldTrigger: false, reason: "Task run not found" };
    }

    // Check if already triggered
    if (run.operatorVerificationStatus) {
      return {
        shouldTrigger: false,
        reason: `Already triggered with status: ${run.operatorVerificationStatus}`,
      };
    }

    // Check if run has PRs
    const hasPullRequests =
      (run.pullRequests && run.pullRequests.length > 0) ||
      run.pullRequestUrl;
    if (!hasPullRequests) {
      return { shouldTrigger: false, reason: "No pull requests on this run" };
    }

    // Check if sandbox is still running
    if (!run.vscode || run.vscode.status !== "running") {
      return {
        shouldTrigger: false,
        reason: `Sandbox not running (status: ${run.vscode?.status ?? "none"})`,
      };
    }

    // Check if we have a worker URL (in ports.worker)
    const workerUrl = run.vscode.ports?.worker;
    if (!workerUrl) {
      return { shouldTrigger: false, reason: "No worker URL available" };
    }

    return {
      shouldTrigger: true,
      reason: "Ready for operator verification",
      workerUrl,
      taskRunId: args.taskRunId,
      teamId: run.teamId,
    };
  },
});

/**
 * Update the operator verification status on a task run.
 */
export const updateVerificationStatus = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      console.warn("[operatorVerification] Task run not found", {
        taskRunId: args.taskRunId,
      });
      return { ok: false };
    }

    await ctx.db.patch(args.taskRunId, {
      operatorVerificationStatus: args.status,
      operatorVerificationError: args.error,
      updatedAt: Date.now(),
    });

    return { ok: true };
  },
});

/**
 * Handle screenshot collection results from the sandbox worker.
 * Called via HTTP POST when screenshots are complete.
 */
export const handleVerificationResult = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    status: v.union(
      v.literal("completed"),
      v.literal("failed"),
      v.literal("skipped")
    ),
    error: v.optional(v.string()),
    screenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
    hasUiChanges: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    console.log("[operatorVerification] Handling verification result", {
      taskRunId: args.taskRunId,
      status: args.status,
      screenshotSetId: args.screenshotSetId,
      hasUiChanges: args.hasUiChanges,
    });

    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      console.warn("[operatorVerification] Task run not found", {
        taskRunId: args.taskRunId,
      });
      return { ok: false, error: "Task run not found" };
    }

    // Update verification status
    await ctx.db.patch(args.taskRunId, {
      operatorVerificationStatus: args.status,
      operatorVerificationError: args.error,
      updatedAt: Date.now(),
      // Link screenshot set if provided
      ...(args.screenshotSetId
        ? { latestScreenshotSetId: args.screenshotSetId }
        : {}),
    });

    // If we have screenshots and a PR, trigger GitHub comment
    if (args.status === "completed" && args.screenshotSetId) {
      const pr = run.pullRequests?.[0];

      if (pr?.repoFullName && pr?.number !== undefined) {
        // Get installation ID for the repo
        const connection = await ctx.runQuery(
          internal.github_app.getProviderConnectionByRepo,
          { repoFullName: pr.repoFullName }
        );

        if (connection?.installationId) {
          console.log(
            "[operatorVerification] Scheduling GitHub comment for screenshots",
            {
              taskRunId: args.taskRunId,
              repoFullName: pr.repoFullName,
              prNumber: pr.number,
            }
          );

          // Schedule the GitHub comment posting
          await ctx.scheduler.runAfter(
            0,
            internal.operatorVerification_actions.postScreenshotsToGitHub,
            {
              taskRunId: args.taskRunId,
              screenshotSetId: args.screenshotSetId,
              installationId: connection.installationId,
              repoFullName: pr.repoFullName,
              prNumber: pr.number,
            }
          );
        } else {
          console.warn(
            "[operatorVerification] No GitHub installation for repo",
            { repoFullName: pr.repoFullName }
          );
        }
      }
    }

    return { ok: true };
  },
});
