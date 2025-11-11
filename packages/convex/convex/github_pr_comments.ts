"use node";
import { v } from "convex/values";
import { fetchInstallationAccessToken } from "../_shared/githubApp";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction } from "./_generated/server";
const CMUX_REPO_FULL_NAME = "cmux/cmux";
const MAX_INLINE_SCREENSHOTS = 6;

function normalizeRepoName(repoFullName: string | undefined | null): string {
  return (repoFullName ?? "").trim().toLowerCase();
}

function getConvexHttpBaseUrl(): string | null {
  const base =
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_SITE_URL ??
    process.env.CONVEX_URL ??
    null;
  if (!base) {
    return null;
  }
  return base.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

function deriveRepoFullName(
  run: Doc<"taskRuns">,
  task: Doc<"tasks"> | null,
  prNumber: number,
): string | null {
  const matchingRecord = (run.pullRequests ?? []).find((record) => {
    if (!record?.repoFullName) {
      return false;
    }
    if (typeof record.number === "number") {
      return record.number === prNumber;
    }
    return false;
  });
  if (matchingRecord?.repoFullName) {
    return matchingRecord.repoFullName;
  }
  if (task?.projectFullName) {
    return task.projectFullName;
  }
  const fallback = run.pullRequests?.[0]?.repoFullName;
  return fallback ?? null;
}

async function commentAlreadyExists({
  accessToken,
  repoFullName,
  prNumber,
  marker,
}: {
  accessToken: string;
  repoFullName: string;
  prNumber: number;
  marker: string;
}): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments?per_page=100`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "cmux-github-bot",
        },
      },
    );
    if (!response.ok) {
      const errorText = await response.text().catch(() => "<no body>");
      console.warn("[github_pr_comments] Failed to list PR comments", {
        repoFullName,
        prNumber,
        status: response.status,
        error: errorText,
      });
      return false;
    }
    const comments = (await response.json()) as Array<{ body?: string }>;
    return comments.some((comment) =>
      typeof comment.body === "string" && comment.body.includes(marker),
    );
  } catch (error) {
    console.warn("[github_pr_comments] Error while checking existing comments", {
      repoFullName,
      prNumber,
      error,
    });
    return false;
  }
}

function buildScreenshotComment({
  inlineImages,
  omittedCount,
  marker,
}: {
  inlineImages: Array<{ alt: string; url: string }>;
  omittedCount: number;
  marker: string;
}): string {
  const lines = [marker, "### 📸 cmux Screenshots", ""];
  inlineImages.forEach((image) => {
    lines.push(`![${image.alt}](${image.url})`);
    lines.push("");
  });
  if (omittedCount > 0) {
    const plural = omittedCount === 1 ? "" : "s";
    lines.push(`+ ${omittedCount} additional screenshot${plural} available in cmux.`);
    lines.push("");
  }
  lines.push(
    "_Captured automatically by cmux. These previews update when the run captures new screenshots._",
  );
  return lines.join("\n").trim();
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

export const postScreenshotComment = internalAction({
  args: {
    taskId: v.id("tasks"),
    taskRunId: v.id("taskRuns"),
    screenshotSetId: v.id("taskRunScreenshotSets"),
  },
  handler: async (ctx, args) => {
    try {
      const [task, taskRun, screenshotSet] = await Promise.all([
        ctx.runQuery(internal.tasks.getByIdInternal, { id: args.taskId }),
        ctx.runQuery(internal.taskRuns.getById, { id: args.taskRunId }),
        ctx.runQuery(
          internal.taskRunScreenshotSets.getByIdInternal,
          { id: args.screenshotSetId },
        ),
      ]);

      if (!task || !taskRun || !screenshotSet) {
        console.warn("[github_pr_comments] Missing data for screenshot comment", {
          hasTask: Boolean(task),
          hasTaskRun: Boolean(taskRun),
          hasScreenshotSet: Boolean(screenshotSet),
        });
        return { ok: false as const, reason: "missing-data" };
      }

      if (
        screenshotSet.status !== "completed" ||
        screenshotSet.images.length === 0
      ) {
        console.log(
          "[github_pr_comments] Skipping screenshot comment due to incomplete set",
          {
            screenshotSetId: args.screenshotSetId,
            status: screenshotSet.status,
            imageCount: screenshotSet.images.length,
          },
        );
        return { ok: false as const, reason: "incomplete-set" };
      }

      const prNumber = taskRun.pullRequestNumber;
      if (typeof prNumber !== "number" || prNumber <= 0) {
        console.warn(
          "[github_pr_comments] Task run missing pull request number",
          { taskRunId: args.taskRunId },
        );
        return { ok: false as const, reason: "missing-pr-number" };
      }

      const repoFullName = deriveRepoFullName(taskRun, task, prNumber);
      if (!repoFullName) {
        console.warn("[github_pr_comments] Unable to determine repo for comment", {
          taskRunId: args.taskRunId,
          taskId: args.taskId,
        });
        return { ok: false as const, reason: "missing-repo" };
      }

      if (
        normalizeRepoName(repoFullName) !==
        normalizeRepoName(CMUX_REPO_FULL_NAME)
      ) {
        return { ok: false as const, reason: "non-target-repo" };
      }

      const prRecord = await ctx.runQuery(
        internal.github_prs.getByTeamRepoNumberInternal,
        {
          teamId: task.teamId,
          repoFullName,
          number: prNumber,
        },
      );

      if (!prRecord) {
        console.warn("[github_pr_comments] Failed to find PR record for comment", {
          teamId: task.teamId,
          repoFullName,
          prNumber,
        });
        return { ok: false as const, reason: "missing-pr-record" };
      }

      const accessToken = await fetchInstallationAccessToken(
        prRecord.installationId,
      );
      if (!accessToken) {
        console.error(
          "[github_pr_comments] Failed to resolve installation token for screenshots",
          {
            installationId: prRecord.installationId,
            repoFullName,
            prNumber,
          },
        );
        return { ok: false as const, reason: "missing-installation-token" };
      }

      const shareTokenResult = await ctx.runMutation(
        internal.taskRunScreenshotSets.ensurePublicShareToken,
        { id: args.screenshotSetId },
      );
      const shareToken = shareTokenResult?.token;
      if (!shareToken) {
        console.error(
          "[github_pr_comments] Unable to obtain share token for screenshots",
          { screenshotSetId: args.screenshotSetId },
        );
        return { ok: false as const, reason: "missing-share-token" };
      }

      const baseUrl = getConvexHttpBaseUrl();
      if (!baseUrl) {
        console.warn(
          "[github_pr_comments] NEXT_PUBLIC_CONVEX_URL not configured; skipping screenshot comment",
        );
        return { ok: false as const, reason: "missing-public-base-url" };
      }
      const images = screenshotSet.images.map((image, index) => ({
        alt: image.fileName ?? `Screenshot ${index + 1}`,
        url: `${baseUrl}/public/screenshots?token=${encodeURIComponent(
          shareToken,
        )}&image=${index}`,
      }));

      if (images.length === 0) {
        return { ok: false as const, reason: "no-images" };
      }

      const inlineImages = images.slice(0, MAX_INLINE_SCREENSHOTS);
      const omittedCount = Math.max(0, images.length - inlineImages.length);

      const marker = `<!-- cmux-screenshot-set:${String(args.screenshotSetId)} -->`;
      const duplicate = await commentAlreadyExists({
        accessToken,
        repoFullName,
        prNumber,
        marker,
      });
      if (duplicate) {
        console.log("[github_pr_comments] Screenshot comment already exists", {
          repoFullName,
          prNumber,
          screenshotSetId: args.screenshotSetId,
        });
        return { ok: true as const, duplicated: true as const };
      }

      const body = buildScreenshotComment({
        inlineImages,
        omittedCount,
        marker,
      });

      const response = await fetch(
        `https://api.github.com/repos/${repoFullName}/issues/${prNumber}/comments`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "cmux-github-bot",
          },
          body: JSON.stringify({ body }),
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "<no body>");
        console.error(
          "[github_pr_comments] Failed to post screenshot comment",
          {
            repoFullName,
            prNumber,
            status: response.status,
            error: errorText,
          },
        );
        return {
          ok: false as const,
          reason: `github-comment-error:${response.status}`,
        };
      }

      const data = (await response.json()) as { id?: number };
      console.log("[github_pr_comments] Posted screenshot comment", {
        repoFullName,
        prNumber,
        screenshotSetId: args.screenshotSetId,
        commentId: data.id,
        imageCount: inlineImages.length,
      });

      return { ok: true as const, commentId: data.id };
    } catch (error) {
      console.error(
        "[github_pr_comments] Unexpected error posting screenshot comment",
        {
          taskId: args.taskId,
          taskRunId: args.taskRunId,
          screenshotSetId: args.screenshotSetId,
          error,
        },
      );
      return {
        ok: false as const,
        reason: "unexpected-error",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
});
