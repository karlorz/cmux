"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";

/**
 * Phase 2: Operator Visual Verification - Actions (requires Node.js runtime)
 *
 * These actions handle external API calls for operator verification.
 */

/**
 * Trigger operator verification for a completed task run.
 * This action:
 * 1. Checks if the run is eligible for verification
 * 2. Sets status to "running"
 * 3. Calls the sandbox worker's screenshot collection endpoint
 * 4. The worker will POST results back to Convex when done
 */
export const triggerOperatorVerification = internalAction({
  args: { taskRunId: v.id("taskRuns") },
  handler: async (ctx, args): Promise<{ ok: boolean; reason?: string; message?: string; error?: string }> => {
    console.log("[operatorVerification] Starting verification check", {
      taskRunId: args.taskRunId,
    });

    // Check eligibility
    const eligibility: {
      shouldTrigger: boolean;
      reason?: string;
      workerUrl?: string;
      taskRunId?: string;
      teamId?: string;
    } = await ctx.runQuery(
      internal.operatorVerification.shouldTriggerVerification,
      { taskRunId: args.taskRunId }
    );

    if (!eligibility.shouldTrigger) {
      console.log("[operatorVerification] Not triggering", {
        taskRunId: args.taskRunId,
        reason: eligibility.reason,
      });

      // Mark as skipped if we have a reason that's not a pending state
      if (eligibility.reason && !eligibility.reason.includes("Already triggered")) {
        await ctx.runMutation(
          internal.operatorVerification.updateVerificationStatus,
          {
            taskRunId: args.taskRunId,
            status: "skipped",
            error: eligibility.reason,
          }
        );
      }
      return { ok: false, reason: eligibility.reason };
    }

    const { workerUrl } = eligibility;
    if (!workerUrl) {
      return { ok: false, reason: "No worker URL" };
    }

    // Set status to running
    await ctx.runMutation(
      internal.operatorVerification.updateVerificationStatus,
      { taskRunId: args.taskRunId, status: "running" }
    );

    try {
      // Perform Socket.IO handshake to get session ID
      const timestamp = Date.now();
      const handshakeUrl = `${workerUrl}/socket.io/?EIO=4&transport=polling&t=${timestamp}`;

      console.log("[operatorVerification] Performing handshake", {
        taskRunId: args.taskRunId,
        handshakeUrl,
      });

      const handshakeResponse = await fetch(handshakeUrl);
      if (!handshakeResponse.ok) {
        throw new Error(
          `Handshake failed: ${handshakeResponse.status} ${handshakeResponse.statusText}`
        );
      }

      const handshakeText = await handshakeResponse.text();
      // Parse Socket.IO response format: digits{json}...
      const jsonMatch = handshakeText.match(/\{[^}]+\}/);
      if (!jsonMatch) {
        throw new Error("Failed to parse handshake response");
      }
      const handshakeData = JSON.parse(jsonMatch[0]) as { sid: string };
      const sid = handshakeData.sid;

      if (!sid) {
        throw new Error("No session ID in handshake response");
      }

      // Connect to /management namespace
      const connectUrl = `${workerUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${Date.now()}`;
      await fetch(connectUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: "40/management",
      });

      // Send screenshot collection trigger
      const payload = JSON.stringify([
        "worker:start-screenshot-collection",
        { taskRunId: args.taskRunId },
      ]);
      const triggerUrl = `${workerUrl}/socket.io/?EIO=4&transport=polling&sid=${sid}&t=${Date.now()}`;

      console.log("[operatorVerification] Sending screenshot trigger", {
        taskRunId: args.taskRunId,
        triggerUrl,
      });

      const triggerResponse = await fetch(triggerUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=UTF-8" },
        body: `42/management,${payload}`,
      });

      if (!triggerResponse.ok) {
        throw new Error(
          `Trigger failed: ${triggerResponse.status} ${triggerResponse.statusText}`
        );
      }

      console.log("[operatorVerification] Screenshot trigger sent successfully", {
        taskRunId: args.taskRunId,
      });

      return { ok: true, message: "Screenshot collection triggered" };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[operatorVerification] Failed to trigger screenshots", {
        taskRunId: args.taskRunId,
        error: errorMessage,
      });

      await ctx.runMutation(
        internal.operatorVerification.updateVerificationStatus,
        {
          taskRunId: args.taskRunId,
          status: "failed",
          error: errorMessage,
        }
      );

      return { ok: false, error: errorMessage };
    }
  },
});

/**
 * Post screenshot gallery to GitHub PR as a comment.
 */
export const postScreenshotsToGitHub = internalAction({
  args: {
    taskRunId: v.id("taskRuns"),
    screenshotSetId: v.id("taskRunScreenshotSets"),
    installationId: v.number(),
    repoFullName: v.string(),
    prNumber: v.number(),
  },
  handler: async (ctx, args) => {
    console.log("[operatorVerification] Posting screenshots to GitHub", args);

    // Get screenshot set details
    const screenshotSet = await ctx.runQuery(
      internal.previewScreenshots.getScreenshotSet,
      { screenshotSetId: args.screenshotSetId }
    );

    if (!screenshotSet) {
      console.error("[operatorVerification] Screenshot set not found", {
        screenshotSetId: args.screenshotSetId,
      });
      return { ok: false, error: "Screenshot set not found" };
    }

    try {
      // Build the workspace URL for the comment
      const run = await ctx.runQuery(internal.taskRuns.getByIdInternal, {
        id: args.taskRunId,
      });
      if (!run) {
        return { ok: false, error: "Task run not found" };
      }

      const team = await ctx.runQuery(internal.teams.getByTeamIdInternal, {
        teamId: run.teamId,
      });
      const teamSlug = team?.slug ?? run.teamId;
      const baseAppUrl = "https://www.manaflow.com";
      const workspaceUrl = `${baseAppUrl}/${teamSlug}/task/${run.taskId}`;

      // Post the comment using the existing infrastructure
      await ctx.runAction(
        internal.github_pr_comments.postOperatorScreenshotComment,
        {
          installationId: args.installationId,
          repoFullName: args.repoFullName,
          prNumber: args.prNumber,
          screenshotSetId: args.screenshotSetId,
          workspaceUrl,
        }
      );

      console.log(
        "[operatorVerification] Screenshots posted to GitHub successfully",
        args
      );
      return { ok: true };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error("[operatorVerification] Failed to post to GitHub", {
        ...args,
        error: errorMessage,
      });
      return { ok: false, error: errorMessage };
    }
  },
});
