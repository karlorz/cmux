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
import type { Doc } from "./_generated/dataModel";
import { internalMutation, type MutationCtx } from "./_generated/server";
import { authQuery } from "./users/utils";
import type { WorkflowRunEvent } from "@octokit/webhooks-types";

type WorkflowRunWithCompletedAt = NonNullable<WorkflowRunEvent["workflow_run"]> & {
  completed_at?: string | null;
};

type WorkflowRunDoc = Doc<"githubWorkflowRuns">;
type WorkflowRunUpdate = Omit<WorkflowRunDoc, "_id" | "_creationTime">;

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

function hasWorkflowRunChanges(
  existing: WorkflowRunDoc,
  incoming: WorkflowRunUpdate,
): boolean {
  for (const key of Object.keys(incoming) as Array<keyof WorkflowRunUpdate>) {
    if (existing[key] !== incoming[key]) {
      return true;
    }
  }
  return false;
}

function shouldUpdateWorkflowRun(
  existing: WorkflowRunDoc,
  incoming: WorkflowRunUpdate,
): boolean {
  if (!hasWorkflowRunChanges(existing, incoming)) {
    return false;
  }

  const incomingUpdatedAt = incoming.updatedAt;
  const existingUpdatedAt = existing.updatedAt;

  const incomingIsOlder =
    incomingUpdatedAt !== undefined &&
    existingUpdatedAt !== undefined &&
    incomingUpdatedAt < existingUpdatedAt;

  const addsCompletion = !existing.runCompletedAt && incoming.runCompletedAt !== undefined;

  if (incomingIsOlder && !addsCompletion) {
    return false;
  }

  return true;
}

function diffWorkflowRunFields(
  existing: WorkflowRunDoc,
  incoming: WorkflowRunUpdate,
): Partial<WorkflowRunDoc> {
  const patch: Partial<WorkflowRunDoc> = {};
  for (const key of Object.keys(incoming) as Array<keyof WorkflowRunUpdate>) {
    const typedKey = key as keyof WorkflowRunDoc;
    if (existing[typedKey] !== incoming[key]) {
      (patch as Record<string, unknown>)[typedKey as string] = incoming[key];
    }
  }
  return patch;
}

function stripWorkflowRunDoc(doc: WorkflowRunDoc): WorkflowRunUpdate {
  const { _id: _omitId, _creationTime: _omitCreated, ...rest } = doc;
  return rest;
}

async function scheduleWorkflowRunDedup(
  ctx: MutationCtx,
  runId: number,
): Promise<void> {
  await ctx.scheduler.runAfter(
    1000,
    internal.github_workflows.cleanupDuplicateWorkflowRuns,
    { runId },
  );
}

export const upsertWorkflowRunFromWebhook = internalMutation({
  args: {
    installationId: v.number(),
    repoFullName: v.string(),
    teamId: v.string(),
    payload: v.any(),
  },
  handler: async (ctx, args) => {
    const payload = args.payload as WorkflowRunEvent;
    const { installationId, repoFullName, teamId } = args;


    // Extract core workflow run data
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

    // Map GitHub status to our schema status (exclude 'requested')
    const githubStatus = payload.workflow_run?.status;
    const status = githubStatus === "requested" ? undefined : githubStatus;

    // Map GitHub conclusion to our schema conclusion (exclude 'stale' and handle null)
    const githubConclusion = payload.workflow_run?.conclusion;
    const conclusion =
      githubConclusion === "stale" || githubConclusion === null
        ? undefined
        : githubConclusion;

    // Normalize timestamps
    const createdAt = normalizeTimestamp(payload.workflow_run?.created_at);
    const updatedAt = normalizeTimestamp(payload.workflow_run?.updated_at);
    const runStartedAt = normalizeTimestamp(
      payload.workflow_run?.run_started_at,
    );

    const runCompletedAt =
      payload.workflow_run?.status === "completed"
        ? normalizeTimestamp((payload.workflow_run as WorkflowRunWithCompletedAt).completed_at)
        : undefined;

    // Calculate run duration if we have both start and completion times
    let runDuration: number | undefined;
    if (runStartedAt && runCompletedAt) {
      runDuration = Math.round((runCompletedAt - runStartedAt) / 1000);
    }

    // Extract actor info
    const actorLogin = payload.workflow_run?.actor?.login;
    const actorId = payload.workflow_run?.actor?.id;

    // Extract triggering PR info if available
    let triggeringPrNumber: number | undefined;
    if (
      payload.workflow_run?.pull_requests &&
      payload.workflow_run.pull_requests.length > 0
    ) {
      // Take the first PR if multiple are associated
      triggeringPrNumber = payload.workflow_run.pull_requests[0]?.number;
    }

    // Prepare the document
    const workflowRunDoc: WorkflowRunUpdate = {
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


    const existingRecord = await ctx.db
      .query("githubWorkflowRuns")
      .withIndex("by_runId", (q) => q.eq("runId", runId))
      .first();

    if (!existingRecord) {
      await ctx.db.insert("githubWorkflowRuns", workflowRunDoc);
      await scheduleWorkflowRunDedup(ctx, runId);
      return;
    }

    if (!shouldUpdateWorkflowRun(existingRecord, workflowRunDoc)) {
      return;
    }

    const patch = diffWorkflowRunFields(existingRecord, workflowRunDoc);
    if (Object.keys(patch).length === 0) {
      return;
    }

    await ctx.db.patch(existingRecord._id, patch);
  },
});

export const cleanupDuplicateWorkflowRuns = internalMutation({
  args: {
    runId: v.number(),
  },
  handler: async (ctx, args) => {
    await cleanupWorkflowRunDuplicates(ctx, args.runId);
  },
});

async function cleanupWorkflowRunDuplicates(
  ctx: MutationCtx,
  runId: number,
): Promise<void> {
  const runs = await ctx.db
    .query("githubWorkflowRuns")
    .withIndex("by_runId", (q) => q.eq("runId", runId))
    .collect();

  if (runs.length <= 1) {
    return;
  }

  const sorted = [...runs].sort((a, b) => {
    if (Boolean(a.runCompletedAt) !== Boolean(b.runCompletedAt)) {
      return Boolean(a.runCompletedAt) ? -1 : 1;
    }
    const updatedDiff = (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    if (updatedDiff !== 0) {
      return updatedDiff;
    }
    return b._creationTime - a._creationTime;
  });

  const [keeper, ...duplicates] = sorted;
  let mergedDoc: WorkflowRunDoc = { ...keeper } as WorkflowRunDoc;
  for (const candidate of duplicates) {
    const candidateData = stripWorkflowRunDoc(candidate);
    if (shouldUpdateWorkflowRun(mergedDoc, candidateData)) {
      mergedDoc = { ...mergedDoc, ...candidateData };
    }
  }

  const mergedPatch = diffWorkflowRunFields(
    keeper,
    stripWorkflowRunDoc(mergedDoc),
  );
  if (Object.keys(mergedPatch).length > 0) {
    await ctx.db.patch(keeper._id, mergedPatch);
  }

  for (const duplicate of duplicates) {
    await ctx.db.delete(duplicate._id);
  }

  console.info("[cleanupDuplicateWorkflowRuns]", {
    runId,
    kept: keeper._id,
    removedCount: duplicates.length,
  });
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
