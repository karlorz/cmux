/**
 * GitHub Actions Workflow Runs
 *
 * Handles workflow_run webhooks from GitHub Actions.
 * These are runs of .github/workflows/*.yml files.
 *
 * NOT to be confused with:
 * - check_run events (see github_check_runs.ts) - third-party checks like Vercel
 * - deployment events (see github_deployments.ts) - deployment records
 * - status events (see github_commit_statuses.ts) - legacy commit statuses
 */
import { v } from "convex/values";
import { getTeamId } from "../_shared/team";
import { internal } from "./_generated/api";
import { authQuery } from "./users/utils";
import { internalMutation, type MutationCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import type { WorkflowRunEvent } from "@octokit/webhooks-types";

type WorkflowRunWithCompletedAt = NonNullable<WorkflowRunEvent["workflow_run"]> & {
  completed_at?: string | null;
};

type WorkflowRunMutationArgs = {
  installationId: number;
  repoFullName: string;
  teamId: string;
  payload: WorkflowRunEvent;
};

type WorkflowRunQueueDoc = Doc<"githubWorkflowRunUpserts">;
type ProcessorStateDoc = Doc<"githubWorkflowRunProcessorState">;

function normalizeTimestamp(
  value: string | number | null | undefined,
): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") {
    return value > 1000000000000 ? value : value * 1000;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const upsertWorkflowRunFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    await upsertWorkflowRun(ctx, {
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      teamId: args.teamId,
      payload: args.payload as WorkflowRunEvent,
    });
  },
});

export const enqueueWorkflowRunUpsert = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
    deliveryId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as WorkflowRunEvent;
    const runId = payload.workflow_run?.id;

    if (!runId) {
      console.warn("[enqueueWorkflowRunUpsert] Missing runId", {
        repoFullName: args.repoFullName,
        teamId: args.teamId,
        deliveryId: args.deliveryId,
      });
      return;
    }

    await ctx.db.insert("githubWorkflowRunUpserts", {
      runId,
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      teamId: args.teamId,
      payload: args.payload,
      deliveryId: args.deliveryId,
      enqueuedAt: Date.now(),
    });

    await ensureWorkflowRunProcessorScheduled(ctx, runId);
  },
});

export const processWorkflowRunQueue = internalMutation({
  args: {
    runId: v.number(),
  },
  handler: async (ctx, args) => {
    const MAX_BATCH = 10;
    let processed = 0;

    while (processed < MAX_BATCH) {
      const nextEntry = await nextPendingWorkflowRun(ctx, args.runId);
      if (!nextEntry) {
        await releaseProcessorState(ctx, args.runId);
        const needsRestart = await nextPendingWorkflowRun(ctx, args.runId);
        if (needsRestart) {
          await ensureWorkflowRunProcessorScheduled(ctx, args.runId);
        }
        return;
      }

      try {
        await upsertWorkflowRun(ctx, {
          installationId: nextEntry.installationId,
          repoFullName: nextEntry.repoFullName,
          teamId: nextEntry.teamId,
          payload: nextEntry.payload as WorkflowRunEvent,
        });
        await ctx.db.delete(nextEntry._id);
      } catch (error) {
        console.error("[processWorkflowRunQueue] Failed to upsert workflow run", {
          runId: args.runId,
          queueEntryId: nextEntry._id,
          error,
        });
        await scheduleWorkflowRunProcessor(ctx, args.runId, 500);
        return;
      }

      processed += 1;
    }

    const hasMore = await nextPendingWorkflowRun(ctx, args.runId);
    if (hasMore) {
      await scheduleWorkflowRunProcessor(ctx, args.runId, 25);
      return;
    }

    await releaseProcessorState(ctx, args.runId);
    const needsRestart = await nextPendingWorkflowRun(ctx, args.runId);
    if (needsRestart) {
      await ensureWorkflowRunProcessorScheduled(ctx, args.runId);
    }
  },
});

async function upsertWorkflowRun(ctx: MutationCtx, args: WorkflowRunMutationArgs) {
  const payload = args.payload;
  const { installationId, repoFullName, teamId } = args;

  const runId = payload.workflow_run?.id;
  const runNumber = payload.workflow_run?.run_number;
  const workflowId = payload.workflow_run?.workflow_id;
  const workflowName = payload.workflow?.name;

  if (!runId || !runNumber || !workflowId || !workflowName) {
    console.warn("[upsertWorkflowRun] Missing required fields", {
      runId,
      runNumber,
      workflowId,
      workflowName,
      repoFullName,
      teamId,
    });
    return;
  }

  const githubStatus = payload.workflow_run?.status;
  const status = githubStatus === "requested" ? undefined : githubStatus;

  const githubConclusion = payload.workflow_run?.conclusion;
  const conclusion =
    githubConclusion === "stale" || githubConclusion === null
      ? undefined
      : githubConclusion;

  const createdAt = normalizeTimestamp(payload.workflow_run?.created_at);
  const updatedAt = normalizeTimestamp(payload.workflow_run?.updated_at);
  const runStartedAt = normalizeTimestamp(payload.workflow_run?.run_started_at);

  const runCompletedAt =
    payload.workflow_run?.status === "completed"
      ? normalizeTimestamp((payload.workflow_run as WorkflowRunWithCompletedAt).completed_at)
      : undefined;

  let runDuration: number | undefined;
  if (runStartedAt && runCompletedAt) {
    runDuration = Math.round((runCompletedAt - runStartedAt) / 1000);
  }

  const actorLogin = payload.workflow_run?.actor?.login;
  const actorId = payload.workflow_run?.actor?.id;

  let triggeringPrNumber: number | undefined;
  if (
    payload.workflow_run?.pull_requests &&
    payload.workflow_run.pull_requests.length > 0
  ) {
    triggeringPrNumber = payload.workflow_run.pull_requests[0]?.number;
  }

  const workflowRunDoc = {
    provider: "github" as const,
    installationId,
    repositoryId: payload.repository?.id,
    repoFullName,
    runId,
    runNumber,
    teamId,
    workflowId,
    workflowName,
    name: payload.workflow_run.name || undefined,
    event: payload.workflow_run.event,
    status,
    conclusion,
    headBranch: payload.workflow_run.head_branch || undefined,
    headSha: payload.workflow_run.head_sha || undefined,
    htmlUrl: payload.workflow_run.html_url || undefined,
    createdAt,
    updatedAt,
    runStartedAt,
    runCompletedAt,
    runDuration,
    actorLogin,
    actorId,
    triggeringPrNumber,
  };

  const existingRecords = await ctx.db
    .query("githubWorkflowRuns")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .collect();

  if (existingRecords.length > 0) {
    await ctx.db.patch(existingRecords[0]._id, workflowRunDoc);

    if (existingRecords.length > 1) {
      console.warn("[upsertWorkflowRun] Found duplicates, cleaning up", {
        runId,
        count: existingRecords.length,
        duplicateIds: existingRecords.slice(1).map((r) => r._id),
      });
      for (const duplicate of existingRecords.slice(1)) {
        await ctx.db.delete(duplicate._id);
      }
    }
  } else {
    await ctx.db.insert("githubWorkflowRuns", workflowRunDoc);
  }
}

async function nextPendingWorkflowRun(
  ctx: MutationCtx,
  runId: number,
): Promise<WorkflowRunQueueDoc | undefined> {
  const entries = await ctx.db
    .query("githubWorkflowRunUpserts")
    .withIndex("by_runId_enqueuedAt", (q) => q.eq("runId", runId))
    .order("asc")
    .take(1);
  return entries[0];
}

async function ensureWorkflowRunProcessorScheduled(
  ctx: MutationCtx,
  runId: number,
  delayMs = 0,
): Promise<void> {
  const state = await getProcessorState(ctx, runId);
  if (!state) {
    const insertedId = await ctx.db.insert("githubWorkflowRunProcessorState", {
      runId,
      processorScheduled: true,
      scheduledAt: Date.now(),
    });
    const canonical = await getProcessorState(ctx, runId);
    if (!canonical || canonical._id !== insertedId) {
      return;
    }
    await scheduleWorkflowRunProcessor(ctx, runId, delayMs);
    return;
  }

  if (state.processorScheduled) {
    return;
  }

  await ctx.db.patch(state._id, {
    processorScheduled: true,
    scheduledAt: Date.now(),
  });
  await scheduleWorkflowRunProcessor(ctx, runId, delayMs);
}

async function scheduleWorkflowRunProcessor(
  ctx: MutationCtx,
  runId: number,
  delayMs = 0,
): Promise<void> {
  await ctx.scheduler.runAfter(
    delayMs,
    internal.github_workflows.processWorkflowRunQueue,
    { runId },
  );
}

async function releaseProcessorState(ctx: MutationCtx, runId: number) {
  const state = await getProcessorState(ctx, runId);
  if (!state || !state.processorScheduled) {
    return;
  }
  await ctx.db.patch(state._id, {
    processorScheduled: false,
    scheduledAt: Date.now(),
  });
}

async function getProcessorState(
  ctx: MutationCtx,
  runId: number,
): Promise<ProcessorStateDoc | null> {
  const states = await ctx.db
    .query("githubWorkflowRunProcessorState")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .order("asc")
    .take(2);

  if (states.length > 1) {
    for (const duplicate of states.slice(1)) {
      await ctx.db.delete(duplicate._id);
    }
  }

  return states[0] ?? null;
}

// Query to get workflow runs for a team
export const getWorkflowRuns = authQuery({
  args: {
    teamSlugOrId: v.string(),
    repoFullName: v.optional(v.string()),
    workflowId: v.optional(v.number()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { teamSlugOrId, repoFullName, workflowId, limit = 50 } = args;
    const teamId = await getTeamId(ctx, teamSlugOrId);

    let query = ctx.db
      .query("githubWorkflowRuns")
      .withIndex("by_team", (q) => q.eq("teamId", teamId))
      .order("desc");

    if (repoFullName) {
      query = ctx.db
        .query("githubWorkflowRuns")
        .withIndex("by_team_repo", (q) =>
          q.eq("teamId", teamId).eq("repoFullName", repoFullName),
        )
        .order("desc");
    }

    if (workflowId) {
      query = ctx.db
        .query("githubWorkflowRuns")
        .withIndex("by_team_workflow", (q) =>
          q.eq("teamId", teamId).eq("workflowId", workflowId),
        )
        .order("desc");
    }

    const runs = await query.take(limit);
    return runs;
  },
});

// Query to get a specific workflow run by ID
export const getWorkflowRunById = authQuery({
  args: {
    teamSlugOrId: v.string(),
    runId: v.number(),
  },
  handler: async (ctx, args) => {
    const { teamSlugOrId, runId } = args;
    const teamId = await getTeamId(ctx, teamSlugOrId);

    const run = await ctx.db
      .query("githubWorkflowRuns")
      .withIndex("by_runId")
      .filter((q) => q.eq(q.field("runId"), runId))
      .filter((q) => q.eq(q.field("teamId"), teamId))
      .unique();

    return run;
  },
});

// Query to get workflow runs for a specific PR
export const getWorkflowRunsForPr = authQuery({
  args: {
    teamSlugOrId: v.string(),
    repoFullName: v.string(),
    prNumber: v.number(),
    headSha: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { teamSlugOrId, repoFullName, prNumber, headSha, limit = 20 } = args;
    const teamId = await getTeamId(ctx, teamSlugOrId);


    // Fetch runs by headSha if provided (more efficient index lookup)
    // Source: workflow_run webhooks from GitHub Actions (NOT check_run events)
    let runs;
    if (headSha) {
      const shaRuns = await ctx.db
        .query("githubWorkflowRuns")
        .withIndex("by_repo_sha", (q) =>
          q.eq("repoFullName", repoFullName).eq("headSha", headSha)
        )
        .order("desc")
        .take(100); // Fetch extra to account for potential duplicates

      // Filter by teamId in memory (index doesn't include it)
      const filtered = shaRuns.filter(r => r.teamId === teamId);

      // Deduplicate by workflow name, keeping the most recently updated one
      const dedupMap = new Map<string, typeof filtered[number]>();
      for (const run of filtered) {
        const key = run.workflowName;
        const existing = dedupMap.get(key);
        if (!existing || (run.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          dedupMap.set(key, run);
        }
      }
      runs = Array.from(dedupMap.values()).slice(0, limit);
    } else {
      // Fallback: fetch all for repo and filter (less efficient)
      const allRuns = await ctx.db
        .query("githubWorkflowRuns")
        .withIndex("by_team_repo", (q) =>
          q.eq("teamId", teamId).eq("repoFullName", repoFullName)
        )
        .order("desc")
        .take(200); // Fetch extra to account for potential duplicates

      const filtered = allRuns.filter(r => r.triggeringPrNumber === prNumber);

      // Deduplicate by workflow name, keeping the most recently updated one
      const dedupMap = new Map<string, typeof filtered[number]>();
      for (const run of filtered) {
        const key = run.workflowName;
        const existing = dedupMap.get(key);
        if (!existing || (run.updatedAt ?? 0) > (existing.updatedAt ?? 0)) {
          dedupMap.set(key, run);
        }
      }
      runs = Array.from(dedupMap.values()).slice(0, limit);
    }


    return runs;
  },
});
