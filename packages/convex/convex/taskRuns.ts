import { v } from "convex/values";
import { SignJWT } from "jose";
import { env } from "../_shared/convex-env";
import { getTeamId, resolveTeamIdLoose } from "../_shared/team";
import { runtimeProviderValidator } from "../_shared/provider-validators";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { authMutation, authQuery, taskIdWithFake } from "./users/utils";
import {
  aggregatePullRequestState,
  type StoredPullRequestInfo,
} from "@cmux/shared/pull-request-state";

const CLOUD_WORKSPACE_JWT_TTL = "7d";
const DEFAULT_JWT_TTL = "12h";

function getJwtTtl(isCloudWorkspace?: boolean): string {
  return isCloudWorkspace ? CLOUD_WORKSPACE_JWT_TTL : DEFAULT_JWT_TTL;
}

function rewriteMorphUrl(url: string): string {
  // do not rewrite ports 39375 39377 39378 39379 39380 39381 39383
  if (
    url.includes("http.cloud.morph.so") &&
    (url.startsWith("https://port-39375-") ||
      url.startsWith("https://port-39377-") ||
      url.startsWith("https://port-39378-") ||
      url.startsWith("https://port-39379-") ||
      url.startsWith("https://port-39380-") ||
      url.startsWith("https://port-39381-") ||
      url.startsWith("https://port-39383-"))
  ) {
    return url;
  }

  // Transform morph URLs to cmux.app format
  // https://port-8101-morphvm-jrtutqa3.http.cloud.morph.so/handler/sign-in -> https://cmux-jrtutqa3-base-8101.cmux.app/handler/sign-in
  if (url.includes("http.cloud.morph.so")) {
    // Extract port and morphId from the URL
    const match = url.match(/port-(\d+)-morphvm-([^.]+)\.http\.cloud\.morph\.so/);
    if (match) {
      const [fullMatch, port, morphId] = match;
      const scope = "base";
      const result = url.replace(
        fullMatch,
        `cmux-${morphId}-${scope}-${port}.cmux.app`
      );
      return result;
    }
  }
  return url;
}

function normalizePullRequestRecords(
  records: readonly StoredPullRequestInfo[] | undefined,
): StoredPullRequestInfo[] | undefined {
  if (!records) {
    return undefined;
  }
  return records.map((record) => ({
    repoFullName: record.repoFullName.trim(),
    url: record.url,
    number: record.number,
    state: record.state,
    isDraft:
      record.isDraft !== undefined
        ? record.isDraft
        : record.state === "draft"
          ? true
          : undefined,
  }));
}

/**
 * Sync the taskRunPullRequests junction table for a taskRun.
 * This enables efficient lookup of taskRuns when a PR webhook fires.
 */
async function syncTaskRunPullRequests(
  ctx: MutationCtx,
  taskRunId: Id<"taskRuns">,
  teamId: string,
  pullRequests: StoredPullRequestInfo[] | undefined,
): Promise<void> {
  // Get existing junction entries for this taskRun
  const existingEntries = await ctx.db
    .query("taskRunPullRequests")
    .withIndex("by_task_run", (q) => q.eq("taskRunId", taskRunId))
    .collect();

  // Build set of new PR identities (repoFullName + prNumber)
  const newPrs = new Map<string, { repoFullName: string; prNumber: number }>();
  for (const pr of pullRequests ?? []) {
    if (pr.number !== undefined) {
      const key = `${pr.repoFullName}:${pr.number}`;
      newPrs.set(key, { repoFullName: pr.repoFullName, prNumber: pr.number });
    }
  }

  // Determine entries to delete and add
  const existingKeys = new Set(
    existingEntries.map((e) => `${e.repoFullName}:${e.prNumber}`),
  );

  const toDelete = existingEntries.filter((entry) => {
    const key = `${entry.repoFullName}:${entry.prNumber}`;
    return !newPrs.has(key);
  });

  const toInsert: Array<{ repoFullName: string; prNumber: number }> = [];
  for (const [key, pr] of newPrs) {
    if (!existingKeys.has(key)) {
      toInsert.push(pr);
    }
  }

  // Batch operations using Promise.all to avoid N+1 queries
  const now = Date.now();
  await Promise.all([
    ...toDelete.map((entry) => ctx.db.delete(entry._id)),
    ...toInsert.map((pr) =>
      ctx.db.insert("taskRunPullRequests", {
        taskRunId,
        teamId,
        repoFullName: pr.repoFullName,
        prNumber: pr.prNumber,
        createdAt: now,
      })
    ),
  ]);
}

function deriveGeneratedBranchName(branch?: string | null): string | undefined {
  if (!branch) return undefined;
  const trimmed = branch.trim();
  if (!trimmed) return undefined;
  const idx = trimmed.lastIndexOf("-");
  if (idx <= 0) return trimmed;
  const candidate = trimmed.slice(0, idx);
  return candidate || trimmed;
}

type EnvironmentErrorPayload = {
  maintenanceError?: string;
  devError?: string;
};

const MAX_ENVIRONMENT_ERROR_MESSAGE_CHARS = 2500;

function normalizeEnvironmentErrorPayload(
  maintenanceError?: string,
  devError?: string,
): EnvironmentErrorPayload {
  const truncate = (msg?: string) => {
    if (!msg) return undefined;
    const trimmed = msg.trim();
    if (!trimmed) return undefined;
    return trimmed.length > MAX_ENVIRONMENT_ERROR_MESSAGE_CHARS
      ? `${trimmed.slice(0, MAX_ENVIRONMENT_ERROR_MESSAGE_CHARS)}…`
      : trimmed;
  };

  const normalizedMaintenance = truncate(maintenanceError);
  const normalizedDev = truncate(devError);

  const payload: EnvironmentErrorPayload = {};
  if (normalizedMaintenance) {
    payload.maintenanceError = normalizedMaintenance;
  }
  if (normalizedDev) {
    payload.devError = normalizedDev;
  }
  return payload;
}

type EnvironmentSummary = Pick<
  Doc<"environments">,
  "_id" | "name" | "selectedRepos"
>;

type TaskRunWithChildren = Doc<"taskRuns"> & {
  children: TaskRunWithChildren[];
  environment: EnvironmentSummary | null;
};

async function collectRunSubtreeIds(
  ctx: MutationCtx,
  rootRunId: Id<"taskRuns">,
  teamId: string,
  userId: string,
): Promise<Id<"taskRuns">[]> {
  const visited = new Set<Id<"taskRuns">>();
  const stack: Id<"taskRuns">[] = [rootRunId];

  while (stack.length > 0) {
    const current = stack.pop()!;
    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const children = await ctx.db
      .query("taskRuns")
      .withIndex("by_parent", (q) => q.eq("parentRunId", current))
      .collect();

    for (const child of children) {
      if (child.teamId !== teamId || child.userId !== userId) {
        continue;
      }
      stack.push(child._id);
    }
  }

  return Array.from(visited);
}

/**
 * After a task run status changes, check if all runs are terminal and update the task accordingly.
 *
 * Logic:
 * - If some runs are still pending/running, do nothing (wait for them)
 * - If all runs are terminal (completed/failed/skipped):
 *   - If ALL failed/skipped (none completed): mark task as failed
 *   - If at least one completed: mark task as completed (crown evaluation handles picking winner)
 */
async function updateTaskStatusFromRuns(
  ctx: MutationCtx,
  taskId: Id<"tasks">,
  teamId: string,
  userId: string,
): Promise<void> {
  // Query all runs for this task (only root-level runs, not children)
  const allRuns = await ctx.db
    .query("taskRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .filter((q) =>
      q.and(
        q.eq(q.field("teamId"), teamId),
        q.eq(q.field("userId"), userId),
        // Only consider root runs (no parent) for task status
        q.eq(q.field("parentRunId"), undefined),
      ),
    )
    .collect();

  if (allRuns.length === 0) {
    return;
  }

  // Check if all runs are in a terminal state
  const terminalStatuses = ["completed", "failed", "skipped"];
  const allTerminal = allRuns.every((run) =>
    terminalStatuses.includes(run.status),
  );

  if (!allTerminal) {
    // Some runs are still pending/running, don't update task yet
    return;
  }

  // All runs are terminal, aggregate the status
  const completedRuns = allRuns.filter((run) => run.status === "completed");
  const failedRuns = allRuns.filter((run) => run.status === "failed");

  const task = await ctx.db.get(taskId);
  if (!task || task.teamId !== teamId) {
    return;
  }

  // Don't update if task is already completed
  if (task.isCompleted) {
    return;
  }

  const now = Date.now();

  if (completedRuns.length === 0) {
    // ALL runs failed or skipped - no successful runs to crown
    const errorMessages = failedRuns
      .map((run) => run.errorMessage)
      .filter(Boolean);
    const aggregatedError =
      failedRuns.length === 1
        ? errorMessages[0] || "Task run failed"
        : `All ${failedRuns.length} task run(s) failed`;

    await ctx.db.patch(taskId, {
      isCompleted: true,
      crownEvaluationStatus: "error",
      crownEvaluationError: aggregatedError,
      updatedAt: now,
    });
  } else {
    // At least one run completed successfully
    // For single run: just mark completed
    // For multiple runs: mark completed, crown evaluation will pick winner
    await ctx.db.patch(taskId, {
      isCompleted: true,
      updatedAt: now,
    });
  }
}

/**
 * D4.3: Update parent run summary when a child run completes.
 * Aggregates child statuses and PRs into parent's summary.
 *
 * Also schedules result aggregation to notify the parent agent's sandbox
 * via MAILBOX.json so the parent can react to child completion.
 */
async function updateParentRunOnChildComplete(
  ctx: MutationCtx,
  childRun: Doc<"taskRuns">,
): Promise<void> {
  if (!childRun.parentRunId) {
    return; // No parent to update
  }

  const parentRun = await ctx.db.get(childRun.parentRunId);
  if (!parentRun) {
    return;
  }

  // Get all children of this parent
  const children = await ctx.db
    .query("taskRuns")
    .withIndex("by_parent", (q) => q.eq("parentRunId", childRun.parentRunId))
    .collect();

  // Count statuses
  const statusCounts: Record<string, number> = {
    pending: 0,
    running: 0,
    completed: 0,
    failed: 0,
    skipped: 0,
  };
  const childPRs: string[] = [];

  for (const child of children) {
    statusCounts[child.status] = (statusCounts[child.status] || 0) + 1;
    if (child.pullRequestUrl) {
      childPRs.push(child.pullRequestUrl);
    }
  }

  const total = children.length;
  const terminal = statusCounts.completed + statusCounts.failed + statusCounts.skipped;
  const allComplete = total > 0 && terminal === total;

  // Build aggregated summary
  const summaryParts: string[] = [];
  const statusEmoji = allComplete
    ? (statusCounts.failed > 0 ? "Warning" : "Complete")
    : "In Progress";
  summaryParts.push(`## Agent Team Status (${statusEmoji})`);
  summaryParts.push(`- Total children: ${total}`);
  summaryParts.push(`- Completed: ${statusCounts.completed}`);
  summaryParts.push(`- Failed: ${statusCounts.failed}`);
  summaryParts.push(`- Running: ${statusCounts.running}`);
  summaryParts.push(`- Pending: ${statusCounts.pending}`);

  if (childPRs.length > 0) {
    summaryParts.push(`\n## Child PRs`);
    for (const pr of childPRs) {
      summaryParts.push(`- ${pr}`);
    }
  }

  const aggregatedSummary = summaryParts.join("\n");

  // Update parent with aggregated info
  const updates: Partial<Doc<"taskRuns">> = {
    updatedAt: Date.now(),
  };

  // Append to existing summary or create new
  if (parentRun.summary) {
    // Check if we already have an Agent Team Status section
    if (parentRun.summary.includes("## Agent Team Status")) {
      // Replace the section
      const beforeSection = parentRun.summary.split("## Agent Team Status")[0];
      updates.summary = beforeSection.trim() + "\n\n" + aggregatedSummary;
    } else {
      updates.summary = parentRun.summary + "\n\n" + aggregatedSummary;
    }
  } else {
    updates.summary = aggregatedSummary;
  }

  await ctx.db.patch(childRun.parentRunId, updates);

  // Schedule result aggregation to notify parent agent's sandbox via MAILBOX.json
  // This allows the parent agent to react to child completion in real-time
  if (parentRun.vscode?.status === "running" && parentRun.vscode?.containerName) {
    await ctx.scheduler.runAfter(
      0,
      internal.resultAggregation.notifyParentOnChildComplete,
      {
        parentRunId: childRun.parentRunId,
        childRunId: childRun._id,
        childAgentName: childRun.agentName,
        childStatus: childRun.status,
        childSummary: childRun.summary,
        childPullRequestUrl: childRun.pullRequestUrl,
        childExitCode: childRun.exitCode,
        statusCounts: {
          pending: statusCounts.pending,
          running: statusCounts.running,
          completed: statusCounts.completed,
          failed: statusCounts.failed,
          skipped: statusCounts.skipped,
        },
        totalChildren: total,
        parentProvider: parentRun.vscode.provider,
        parentContainerName: parentRun.vscode.containerName,
      }
    );
  }
}

async function fetchTaskRunsForTask(
  ctx: QueryCtx,
  teamId: string,
  taskId: Id<"tasks">,
  includeArchived = true,
): Promise<TaskRunWithChildren[]> {
  const runs = await ctx.db
    .query("taskRuns")
    .withIndex("by_task", (q) => q.eq("taskId", taskId))
    .filter((q) => q.eq(q.field("teamId"), teamId))
    .collect();

  const environmentSummaries = new Map<
    Id<"environments">,
    EnvironmentSummary
  >();
  const environmentIds = Array.from(
    new Set(
      runs
        .map((run) => run.environmentId)
        .filter((id): id is Id<"environments"> => id !== undefined),
    ),
  );

  if (environmentIds.length > 0) {
    const environmentDocs = await Promise.all(
      environmentIds.map((environmentId) => ctx.db.get(environmentId)),
    );

    for (const environment of environmentDocs) {
      if (!environment || environment.teamId !== teamId) continue;
      environmentSummaries.set(environment._id, {
        _id: environment._id,
        name: environment.name,
        selectedRepos: environment.selectedRepos,
      });
    }
  }

  const runMap = new Map<string, TaskRunWithChildren>();
  const rootRuns: TaskRunWithChildren[] = [];

  runs.forEach((run) => {
    if (!includeArchived && run.isArchived) {
      return;
    }
    const networking = run.networking?.map((item) => ({
      ...item,
      url: rewriteMorphUrl(item.url),
    }));

    runMap.set(run._id, {
      ...run,
      log: "",
      networking,
      children: [],
      environment: run.environmentId
        ? (environmentSummaries.get(run.environmentId) ?? null)
        : null,
    });
  });

  runs.forEach((run) => {
    if (!includeArchived && run.isArchived) {
      return;
    }
    const runWithChildren = runMap.get(run._id)!;
    if (run.parentRunId) {
      const parent = runMap.get(run.parentRunId);
      if (parent) {
        parent.children.push(runWithChildren);
      }
    } else {
      rootRuns.push(runWithChildren);
    }
  });

  const sortRuns = (items: TaskRunWithChildren[]) => {
    items.sort((a, b) => {
      // Sort crowned runs first, then by creation time
      if (a.isCrowned && !b.isCrowned) return -1;
      if (!a.isCrowned && b.isCrowned) return 1;
      return a.createdAt - b.createdAt;
    });
    items.forEach((item) => sortRuns(item.children));
  };
  sortRuns(rootRuns);

  return rootRuns;
}

/**
 * Internal query to get a task run by ID (for use in actions).
 * Used by PR Comment → Agent result posting.
 */
export const getByIdInternal = internalQuery({
  args: { id: v.id("taskRuns") },
  handler: async (ctx, { id }) => {
    return ctx.db.get(id);
  },
});

/**
 * Internal mutation to create a task run with JWT.
 * Used by CLI HTTP API for task creation with sandbox provisioning.
 */
export const createInternal = internalMutation({
  args: {
    teamId: v.string(),
    userId: v.string(),
    taskId: v.id("tasks"),
    prompt: v.string(),
    agentName: v.optional(v.string()),
    newBranch: v.optional(v.string()),
    environmentId: v.optional(v.id("environments")),
    parentRunId: v.optional(v.id("taskRuns")), // Agent Teams (D4) - parent-child relationships
    isOrchestrationHead: v.optional(v.boolean()), // Whether this is a head agent for orchestration
    // PR Comment → Agent: link back to source comment for result posting
    githubCommentId: v.optional(v.number()),
    githubCommentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const task = await ctx.db.get(args.taskId);
    if (!task || task.teamId !== args.teamId || task.userId !== args.userId) {
      throw new Error("Task not found or unauthorized");
    }
    if (args.environmentId) {
      const environment = await ctx.db.get(args.environmentId);
      if (!environment || environment.teamId !== args.teamId) {
        throw new Error("Environment not found");
      }
    }
    // Validate parent run if specified (must belong to same team AND user)
    if (args.parentRunId) {
      const parentRun = await ctx.db.get(args.parentRunId);
      if (!parentRun || parentRun.teamId !== args.teamId || parentRun.userId !== args.userId) {
        throw new Error("Parent task run not found or unauthorized");
      }
    }
    const taskRunId = await ctx.db.insert("taskRuns", {
      taskId: args.taskId,
      parentRunId: args.parentRunId,
      prompt: args.prompt,
      agentName: args.agentName,
      newBranch: args.newBranch,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      userId: args.userId,
      teamId: args.teamId,
      environmentId: args.environmentId,
      isLocalWorkspace: task.isLocalWorkspace,
      isCloudWorkspace: task.isCloudWorkspace,
      isOrchestrationHead: args.isOrchestrationHead,
      githubCommentId: args.githubCommentId,
      githubCommentUrl: args.githubCommentUrl,
    });

    // Update task's lastActivityAt and selectedTaskRunId
    const hasCrownedRun = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("isCrowned"), true))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .first();

    const taskPatch: {
      lastActivityAt: number;
      selectedTaskRunId?: Id<"taskRuns">;
    } = {
      lastActivityAt: now,
    };

    if (!hasCrownedRun) {
      taskPatch.selectedTaskRunId = taskRunId;
    }

    await ctx.db.patch(args.taskId, taskPatch);

    // Generate JWT for sandbox authentication
    const jwt = await new SignJWT({
      taskRunId,
      teamId: args.teamId,
      userId: args.userId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(getJwtTtl(task.isCloudWorkspace))
      .sign(new TextEncoder().encode(env.CMUX_TASK_RUN_JWT_SECRET));

    return { taskRunId, jwt };
  },
});

// Create a new task run
export const create = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskId: v.id("tasks"),
    parentRunId: v.optional(v.id("taskRuns")),
    prompt: v.string(),
    agentName: v.optional(v.string()),
    newBranch: v.optional(v.string()),
    environmentId: v.optional(v.id("environments")),
    isOrchestrationHead: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const now = Date.now();
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.teamId !== teamId || task.userId !== userId) {
      throw new Error("Task not found or unauthorized");
    }
    if (args.environmentId) {
      const environment = await ctx.db.get(args.environmentId);
      if (!environment || environment.teamId !== teamId) {
        throw new Error("Environment not found");
      }
    }
    // Validate parent run if specified (must belong to same team AND user)
    if (args.parentRunId) {
      const parentRun = await ctx.db.get(args.parentRunId);
      if (!parentRun || parentRun.teamId !== teamId || parentRun.userId !== userId) {
        throw new Error("Parent task run not found or unauthorized");
      }
    }
    const taskRunId = await ctx.db.insert("taskRuns", {
      taskId: args.taskId,
      parentRunId: args.parentRunId,
      prompt: args.prompt,
      agentName: args.agentName,
      newBranch: args.newBranch,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      userId,
      teamId,
      environmentId: args.environmentId,
      isLocalWorkspace: task.isLocalWorkspace,
      isCloudWorkspace: task.isCloudWorkspace,
      isOrchestrationHead: args.isOrchestrationHead,
    });

    // Update task's lastActivityAt for sorting
    const generatedBranchName = deriveGeneratedBranchName(args.newBranch);
    const taskPatch: {
      generatedBranchName?: string;
      lastActivityAt: number;
      selectedTaskRunId?: Id<"taskRuns">;
    } = {
      lastActivityAt: now,
    };
    if (
      generatedBranchName &&
      task.generatedBranchName !== generatedBranchName
    ) {
      taskPatch.generatedBranchName = generatedBranchName;
    }

    // Update selectedTaskRunId if task has no crowned run
    // (new run becomes the selected run by default)
    const hasCrownedRun = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("isCrowned"), true))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .first();

    if (!hasCrownedRun) {
      taskPatch.selectedTaskRunId = taskRunId;
    }

    await ctx.db.patch(args.taskId, taskPatch);
    const jwt = await new SignJWT({
      taskRunId,
      teamId,
      userId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(getJwtTtl(task.isCloudWorkspace))
      .sign(new TextEncoder().encode(env.CMUX_TASK_RUN_JWT_SECRET));

    return { taskRunId, jwt };
  },
});

// Get all task runs for a task, organized in tree structure
export const getByTask = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskId: taskIdWithFake,
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    if (typeof args.taskId === "string" && args.taskId.startsWith("fake-")) {
      return [];
    }

    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    return await fetchTaskRunsForTask(
      ctx,
      teamId,
      args.taskId as Id<"tasks">,
      args.includeArchived ?? true,
    );
  },
});

async function fetchBranchMetadataForRepo(
  ctx: QueryCtx,
  teamId: string,
  repo: string,
): Promise<Doc<"branches">[]> {
  const rows = await ctx.db
    .query("branches")
    .withIndex("by_repo", (q) => q.eq("repo", repo))
    .filter((q) => q.eq(q.field("teamId"), teamId))
    .collect();

  // Deduplicate by branch name, preferring rows with known SHA info or recent activity
  const byName = new Map<string, Doc<"branches">>();
  for (const row of rows) {
    const existing = byName.get(row.name);
    if (!existing) {
      byName.set(row.name, row);
      continue;
    }

    const currentHasKnown = Boolean(
      row.lastKnownBaseSha || row.lastKnownMergeCommitSha,
    );
    const existingHasKnown = Boolean(
      existing.lastKnownBaseSha || existing.lastKnownMergeCommitSha,
    );

    if (currentHasKnown && !existingHasKnown) {
      byName.set(row.name, row);
      continue;
    }

    if (!currentHasKnown && existingHasKnown) {
      continue;
    }

    const currentActivity = row.lastActivityAt ?? -Infinity;
    const existingActivity = existing.lastActivityAt ?? -Infinity;
    if (currentActivity > existingActivity) {
      byName.set(row.name, row);
    }
  }

  return Array.from(byName.values());
}

// Update task run status
export const updateStatus = internalMutation({
  args: {
    id: v.id("taskRuns"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("Task run not found");
    }

    const now = Date.now();
    const updates: {
      status: typeof args.status;
      updatedAt: number;
      completedAt?: number;
      exitCode?: number;
    } = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = now;
      if (args.exitCode !== undefined) {
        updates.exitCode = args.exitCode;
      }
    }

    await ctx.db.patch(args.id, updates);

    // After updating to a terminal status, check if we should update the task status
    if (args.status === "completed" || args.status === "failed") {
      await updateTaskStatusFromRuns(ctx, run.taskId, run.teamId, run.userId);

      // D4.3: Update parent run if this is a child run
      const updatedRun = await ctx.db.get(args.id);
      if (updatedRun) {
        await updateParentRunOnChildComplete(ctx, updatedRun);
      }

      // Create a notification for the user (also marks as unread)
      console.log("[taskNotifications] Creating notification", {
        taskId: run.taskId,
        taskRunId: args.id,
        type: args.status === "completed" ? "run_completed" : "run_failed",
      });
      await ctx.runMutation(internal.taskNotifications.createInternal, {
        taskId: run.taskId,
        taskRunId: args.id,
        teamId: run.teamId,
        userId: run.userId,
        type: args.status === "completed" ? "run_completed" : "run_failed",
      });

      // Create feed event for team activity stream
      const task = await ctx.db.get(run.taskId);
      const eventType = args.status === "completed" ? "task_completed" : "task_failed";
      const eventTitle = args.status === "completed"
        ? `Task run completed: ${task?.text?.slice(0, 60) ?? "Unknown task"}${(task?.text?.length ?? 0) > 60 ? "..." : ""}`
        : `Task run failed: ${task?.text?.slice(0, 60) ?? "Unknown task"}${(task?.text?.length ?? 0) > 60 ? "..." : ""}`;

      await ctx.runMutation(internal.feedEvents.create, {
        teamId: run.teamId,
        userId: run.userId,
        eventType,
        title: eventTitle,
        description: args.status === "failed" ? run.errorMessage : undefined,
        taskId: run.taskId,
        taskRunId: args.id,
        agentName: run.agentName,
        repoFullName: task?.projectFullName,
        errorMessage: args.status === "failed" ? run.errorMessage : undefined,
      });

      // Schedule GitHub Project status sync if task has project linkage
      if (task?.githubProjectId && task?.githubProjectItemId && task?.githubProjectInstallationId) {
        await ctx.scheduler.runAfter(
          0,
          internal.githubProjectSync.syncStatusToProject,
          { taskId: run.taskId },
        );
      }

      // PR Comment → Agent: Post result back to source comment if this run was triggered by a comment
      if (run.githubCommentId && run.githubCommentUrl && task?.projectFullName) {
        await ctx.scheduler.runAfter(
          0,
          internal.github_pr_comments.postResultToSourceComment,
          {
            taskRunId: args.id,
            repoFullName: task.projectFullName,
            status: args.status,
          },
        );
      }

      // Phase 2: Operator visual verification - trigger screenshots after completion
      // Only trigger for completed runs (not failed) that have a running sandbox
      if (
        args.status === "completed" &&
        run.vscode?.status === "running" &&
        run.vscode?.ports?.worker &&
        (run.pullRequests?.length || run.pullRequestUrl) &&
        env.CMUX_ENABLE_OPERATOR_VERIFICATION === "true"
      ) {
        console.log("[operatorVerification] Scheduling verification", {
          taskRunId: args.id,
          hasPullRequests: !!(run.pullRequests?.length || run.pullRequestUrl),
        });
        await ctx.scheduler.runAfter(
          // Delay 5 seconds to let the sandbox stabilize after agent completes
          5000,
          internal.operatorVerification_actions.triggerOperatorVerification,
          { taskRunId: args.id }
        );
      }
    }
  },
});

// Interruption state validator - matches schema definition (P2: Runtime interruptions)
const interruptionStatusValidator = v.union(
  v.literal("none"),
  v.literal("approval_pending"),
  v.literal("paused_by_operator"),
  v.literal("sandbox_paused"),
  v.literal("context_overflow"),
  v.literal("rate_limited"),
  v.literal("timed_out"),
  // P2: Extended interruption types for generalized runtime model
  v.literal("checkpoint_pending"),
  v.literal("handoff_pending"),
  v.literal("user_input_required")
);

/**
 * Set interruption state on a task run.
 * Used when an agent is blocked (approval needed, sandbox paused, checkpoint, handoff, etc.)
 *
 * P2: Extended to support provider session binding and checkpoint references for
 * replay-safe resume and explicit resume ancestry.
 */
export const setInterruptionState = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    status: interruptionStatusValidator,
    reason: v.optional(v.string()),
    approvalRequestId: v.optional(v.string()),
    expiresAt: v.optional(v.number()),
    resumeToken: v.optional(v.string()),
    // P2: Provider session binding for resume ancestry
    providerSessionId: v.optional(v.string()),
    resumeTargetId: v.optional(v.string()),
    // P2: Checkpoint reference for replay-safe resume
    checkpointRef: v.optional(v.string()),
    checkpointGeneration: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      throw new Error("Task run not found");
    }

    const now = Date.now();

    // Build interruption state with P2 fields
    const interruptionState: NonNullable<typeof run.interruptionState> = {
      status: args.status,
      reason: args.reason,
      approvalRequestId: args.approvalRequestId,
      blockedAt: now,
      expiresAt: args.expiresAt,
      resumeToken: args.resumeToken,
      // P2: Include provider session binding if provided
      providerSessionId: args.providerSessionId,
      resumeTargetId: args.resumeTargetId,
      // P2: Include checkpoint reference if provided
      checkpointRef: args.checkpointRef,
      checkpointGeneration: args.checkpointGeneration,
    };

    await ctx.db.patch(args.taskRunId, {
      interruptionState,
      updatedAt: now,
    });

    // Create feed event for interruption
    const task = await ctx.db.get(run.taskId);
    const reasonText = args.reason ? `: ${args.reason}` : "";
    // Note: eventType validated in feedEvents.ts and schema.ts, types regenerate at dev time
    await ctx.runMutation(internal.feedEvents.create, {
      teamId: run.teamId,
      userId: run.userId,
      eventType: "task_interrupted" as "approval_required",
      title: `Agent paused (${args.status})${reasonText}`,
      description: args.reason,
      taskId: run.taskId,
      taskRunId: args.taskRunId,
      agentName: run.agentName,
      repoFullName: task?.projectFullName,
    });
  },
});

/**
 * Resolve an interruption (approval granted, resume from pause, etc.)
 */
export const resolveInterruption = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    resolvedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      throw new Error("Task run not found");
    }

    if (!run.interruptionState || run.interruptionState.status === "none") {
      // Already resolved or never interrupted
      return;
    }

    const now = Date.now();
    await ctx.db.patch(args.taskRunId, {
      interruptionState: {
        ...run.interruptionState,
        status: "none",
        resolvedAt: now,
        resolvedBy: args.resolvedBy,
      },
      updatedAt: now,
    });

    // Create feed event for resolution
    const task = await ctx.db.get(run.taskId);
    // Note: eventType validated in feedEvents.ts and schema.ts, types regenerate at dev time
    await ctx.runMutation(internal.feedEvents.create, {
      teamId: run.teamId,
      userId: run.userId,
      eventType: "task_resumed" as "approval_resolved",
      title: `Agent resumed${args.resolvedBy ? ` by ${args.resolvedBy}` : ""}`,
      taskId: run.taskId,
      taskRunId: args.taskRunId,
      agentName: run.agentName,
      repoFullName: task?.projectFullName,
    });
  },
});

/**
 * Query to check if a task run is currently interrupted (internal).
 */
export const isInterrupted = internalQuery({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      return { interrupted: false, status: "none" as const };
    }

    const state = run.interruptionState;
    if (!state || state.status === "none") {
      return { interrupted: false, status: "none" as const };
    }

    return {
      interrupted: true,
      status: state.status,
      reason: state.reason,
      blockedAt: state.blockedAt,
      expiresAt: state.expiresAt,
      approvalRequestId: state.approvalRequestId,
      // P2: Include provider session and checkpoint info
      providerSessionId: state.providerSessionId,
      resumeTargetId: state.resumeTargetId,
      checkpointRef: state.checkpointRef,
      checkpointGeneration: state.checkpointGeneration,
    };
  },
});

/**
 * P2: Public query to get full interruption state for UI visibility.
 * Returns the complete interruption state including provider session binding
 * and checkpoint references for operator-facing dashboards.
 */
export const getInterruptionState = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    const run = await ctx.db.get(args.taskRunId);
    if (!run || run.teamId !== teamId) {
      return null;
    }

    const state = run.interruptionState;
    if (!state || state.status === "none") {
      return {
        interrupted: false,
        status: "none" as const,
        taskRunId: args.taskRunId,
        agentName: run.agentName,
      };
    }

    return {
      interrupted: true,
      taskRunId: args.taskRunId,
      agentName: run.agentName,
      // Core interruption fields
      status: state.status,
      reason: state.reason,
      blockedAt: state.blockedAt,
      expiresAt: state.expiresAt,
      resolvedAt: state.resolvedAt,
      resolvedBy: state.resolvedBy,
      // Approval link
      approvalRequestId: state.approvalRequestId,
      // P2: Provider session binding
      providerSessionId: state.providerSessionId,
      resumeTargetId: state.resumeTargetId,
      resumeToken: state.resumeToken,
      // P2: Checkpoint reference
      checkpointRef: state.checkpointRef,
      checkpointGeneration: state.checkpointGeneration,
      // Computed: is resumable?
      canResume: canResumeFromInterruption(state),
    };
  },
});

/**
 * P2: Determine if an interruption can be resumed.
 * Used by UI to show/hide resume buttons appropriately.
 */
function canResumeFromInterruption(state: {
  status: string;
  resumeToken?: string;
  providerSessionId?: string;
  checkpointRef?: string;
}): boolean {
  // Cannot resume if already resolved
  if (state.status === "none") return false;

  // Approval-based interruptions require resolution through approval flow
  if (state.status === "approval_pending") return false;

  // Checkpoint-based resume requires a checkpoint reference
  if (state.status === "checkpoint_pending") {
    return !!state.checkpointRef;
  }

  // Handoff requires a target
  if (state.status === "handoff_pending") return false;

  // Other interruptions can be resumed if we have session or token
  return !!(state.resumeToken || state.providerSessionId);
}

export const getRunDiffContext = authQuery({
  args: {
    teamSlugOrId: v.string(),
    taskId: v.id("tasks"),
    runId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Note: taskRunCompleted will be updated below after fetching runDoc
    const screenshotConfig = {
      screenshotWorkflowEnabled:
        env.CMUX_ENABLE_SCREENSHOT_WORKFLOW === "true" ||
        env.CMUX_ENABLE_SCREENSHOT_WORKFLOW === "1",
      taskRunCompleted: false, // Will be updated below
    };

    const [taskDoc, taskRuns] = await Promise.all([
      ctx.db.get(args.taskId),
      fetchTaskRunsForTask(ctx, teamId, args.taskId, true),
    ]);

    if (!taskDoc || taskDoc.teamId !== teamId) {
      return {
        task: null,
        taskRuns,
        branchMetadataByRepo: {} as Record<string, Doc<"branches">[]>,
        screenshotSets: [],
        screenshotConfig,
      };
    }

    let taskWithImages = taskDoc;
    if (taskDoc.images && taskDoc.images.length > 0) {
      const imagesWithUrls = await Promise.all(
        taskDoc.images.map(async (image) => {
          const url = await ctx.storage.getUrl(image.storageId);
          return {
            ...image,
            url,
          };
        }),
      );
      taskWithImages = {
        ...taskDoc,
        images: imagesWithUrls,
      };
    }

    const trimmedProjectFullName = taskDoc.projectFullName?.trim();
    const branchMetadataByRepo: Record<string, Doc<"branches">[]> = {};

    if (trimmedProjectFullName) {
      try {
        const metadata = await fetchBranchMetadataForRepo(
          ctx,
          teamId,
          trimmedProjectFullName,
        );
        if (metadata.length > 0) {
          branchMetadataByRepo[trimmedProjectFullName] = metadata;
        }
      } catch {
        // swallow errors – branch metadata is optional for diff prefetching
      }
    }

    // Fetch the run document to check status and get screenshots
    const runDoc = await ctx.db.get(args.runId);
    const taskRunCompleted =
      runDoc?.status === "completed" || runDoc?.status === "failed";

    const screenshotSets = await (async () => {
      // Prevent leaking screenshots for runs outside the authenticated task/team
      if (
        !runDoc ||
        runDoc.teamId !== teamId ||
        runDoc.taskId !== args.taskId
      ) {
        return [];
      }

      const screenshotSetDocs = await ctx.db
        .query("taskRunScreenshotSets")
        .withIndex("by_run_capturedAt", (q) => q.eq("runId", args.runId))
        .collect();

      screenshotSetDocs.sort((a, b) => b.capturedAt - a.capturedAt);

      const trimmedScreenshotSets = screenshotSetDocs.slice(0, 20);

      return Promise.all(
        trimmedScreenshotSets.map(async (set) => {
          const imagesWithUrls = await Promise.all(
            set.images.map(async (image) => {
              const url = await ctx.storage.getUrl(image.storageId);
              return {
                ...image,
                url: url ?? undefined,
              };
            }),
          );
          const videosWithUrls = set.videos
            ? await Promise.all(
                set.videos.map(async (video) => {
                  const url = await ctx.storage.getUrl(video.storageId);
                  return {
                    ...video,
                    url: url ?? undefined,
                  };
                }),
              )
            : undefined;
          return {
            ...set,
            images: imagesWithUrls,
            videos: videosWithUrls,
          };
        }),
      );
    })();

    return {
      task: taskWithImages,
      taskRuns,
      branchMetadataByRepo,
      screenshotSets,
      screenshotConfig: {
        ...screenshotConfig,
        taskRunCompleted,
      },
    };
  },
});

// Update task run summary
export const updateSummary = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    summary: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      summary: args.summary,
      updatedAt: Date.now(),
    });
  },
});

// Get a single task run
export const get = authQuery({
  args: { teamSlugOrId: v.string(), id: v.id("taskRuns") },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId) {
      return null;
    }
    // Rewrite morph URLs in networking field
    if (doc.networking) {
      return {
        ...doc,
        networking: doc.networking.map((item) => ({
          ...item,
          url: rewriteMorphUrl(item.url),
        })),
      };
    }
    return doc;
  },
});

/**
 * Get context health summary for a task run (authenticated).
 * Exposes getContextHealthSummary for the TaskRunMemoryPanel.
 */
export const getContextHealth = authQuery({
  args: { teamSlugOrId: v.string(), id: v.id("taskRuns") },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId) {
      return null;
    }

    const contextUsage = doc.contextUsage;
    const orchestrationId = doc.orchestrationId ?? args.id;

    // Get recent context_warning events for this task run
    const recentWarnings = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_type", (q) =>
        q.eq("orchestrationId", orchestrationId).eq("eventType", "context_warning")
      )
      .order("desc")
      .take(5);

    // Determine latest severity from warnings
    let latestWarningSeverity: "info" | "warning" | "critical" | null = null;
    const warningReasons: string[] = [];

    for (const event of recentWarnings) {
      const payload = event.payload as { severity?: string; summary?: string } | undefined;
      if (payload?.severity) {
        if (!latestWarningSeverity || payload.severity === "critical") {
          latestWarningSeverity = payload.severity as "info" | "warning" | "critical";
        }
      }
      if (payload?.summary && !warningReasons.includes(payload.summary)) {
        warningReasons.push(payload.summary);
      }
    }

    // Get recent context_compacted events
    const recentCompactions = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_type", (q) =>
        q.eq("orchestrationId", orchestrationId).eq("eventType", "context_compacted")
      )
      .order("desc")
      .take(3);

    return {
      taskRunId: args.id,
      provider: doc.agentName ?? "unknown",
      // Context usage stats
      totalInputTokens: contextUsage?.totalInputTokens ?? 0,
      totalOutputTokens: contextUsage?.totalOutputTokens ?? 0,
      contextWindow: contextUsage?.contextWindow,
      usagePercent: contextUsage?.usagePercent,
      // Warning state
      latestWarningSeverity,
      topWarningReasons: warningReasons.slice(0, 3),
      warningCount: recentWarnings.length,
      // Compaction state
      recentCompactionCount: recentCompactions.length,
      // Timestamps
      lastUpdatedAt: contextUsage?.lastUpdated ?? doc.updatedAt,
    };
  },
});

// Subscribe to task run updates
export const subscribe = authQuery({
  args: { teamSlugOrId: v.string(), id: v.id("taskRuns") },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId) {
      return null;
    }

    // Check if this is a preview task - if so, allow team-wide access
    const task = await ctx.db.get(doc.taskId);
    const isPreviewTask = task?.isPreview === true;

    // For preview tasks, only require team membership; otherwise require user ownership
    if (!isPreviewTask && doc.userId !== userId) {
      return null;
    }

    // Rewrite morph URLs in networking field
    if (doc.networking) {
      return {
        ...doc,
        networking: doc.networking.map((item) => ({
          ...item,
          url: rewriteMorphUrl(item.url),
        })),
      };
    }
    return doc;
  },
});

// Internal mutation to update exit code
export const updateExitCode = internalMutation({
  args: {
    id: v.id("taskRuns"),
    exitCode: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      exitCode: args.exitCode,
      updatedAt: Date.now(),
    });
  },
});

export const updateScreenshotMetadata = internalMutation({
  args: {
    id: v.id("taskRuns"),
    storageId: v.id("_storage"),
    mimeType: v.optional(v.string()),
    fileName: v.optional(v.string()),
    commitSha: v.optional(v.string()),
    screenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      screenshotStorageId: args.storageId,
      screenshotCapturedAt: Date.now(),
      screenshotMimeType: args.mimeType,
      screenshotFileName: args.fileName,
      screenshotCommitSha: args.commitSha,
      latestScreenshotSetId: args.screenshotSetId,
      updatedAt: Date.now(),
    });
  },
});

export const clearScreenshotMetadata = internalMutation({
  args: {
    id: v.id("taskRuns"),
    screenshotSetId: v.optional(v.id("taskRunScreenshotSets")),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      screenshotStorageId: undefined,
      screenshotCapturedAt: undefined,
      screenshotMimeType: undefined,
      screenshotFileName: undefined,
      screenshotCommitSha: undefined,
      latestScreenshotSetId: args.screenshotSetId,
      updatedAt: Date.now(),
    });
  },
});

// Update worktree path for a task run
export const updateWorktreePath = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    worktreePath: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      worktreePath: args.worktreePath,
      updatedAt: Date.now(),
    });
  },
});

// Update branch name for a task run (called after branch generation completes)
export const updateBranch = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    newBranch: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      newBranch: args.newBranch,
      updatedAt: Date.now(),
    });

    // Also update the task's generatedBranchName if this is the first branch
    const task = await ctx.db.get(doc.taskId);
    if (task) {
      const generatedBranchName = deriveGeneratedBranchName(args.newBranch);
      if (
        generatedBranchName &&
        task.generatedBranchName !== generatedBranchName
      ) {
        await ctx.db.patch(doc.taskId, {
          generatedBranchName,
        });
      }
    }
  },
});

// Batch update branch names for multiple task runs
export const updateBranchBatch = authMutation({
  args: {
    teamSlugOrId: v.string(),
    updates: v.array(
      v.object({
        id: v.id("taskRuns"),
        newBranch: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const now = Date.now();

    let firstGeneratedBranchName: string | undefined;

    for (const update of args.updates) {
      const doc = await ctx.db.get(update.id);
      if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
        throw new Error(`Task run ${update.id} not found or unauthorized`);
      }
      await ctx.db.patch(update.id, {
        newBranch: update.newBranch,
        updatedAt: now,
      });

      // Track the first generated branch name to update the task
      if (!firstGeneratedBranchName) {
        firstGeneratedBranchName = deriveGeneratedBranchName(update.newBranch);
        if (firstGeneratedBranchName) {
          const task = await ctx.db.get(doc.taskId);
          if (
            task &&
            task.generatedBranchName !== firstGeneratedBranchName
          ) {
            await ctx.db.patch(doc.taskId, {
              generatedBranchName: firstGeneratedBranchName,
            });
          }
        }
      }
    }
  },
});

// Get JWT for an existing task run (used when task runs are pre-created)
export const getJwt = authMutation({
  args: {
    teamSlugOrId: v.string(),
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.taskRunId);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    const jwt = await new SignJWT({
      taskRunId: args.taskRunId,
      teamId,
      userId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(getJwtTtl(doc.isCloudWorkspace))
      .sign(new TextEncoder().encode(env.CMUX_TASK_RUN_JWT_SECRET));

    return { jwt };
  },
});

// Internal version of getJwt for background worker orchestration
// Does not require user authentication - used by internal spawn endpoint
export const getJwtInternal = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.taskRunId);
    if (!doc) {
      throw new Error("Task run not found");
    }

    const jwt = await new SignJWT({
      taskRunId: args.taskRunId,
      teamId: doc.teamId,
      userId: doc.userId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(getJwtTtl(doc.isCloudWorkspace))
      .sign(new TextEncoder().encode(env.CMUX_TASK_RUN_JWT_SECRET));

    return { jwt, teamId: doc.teamId, userId: doc.userId };
  },
});

// Internal mutation to update branch without auth
export const updateBranchInternal = internalMutation({
  args: {
    id: v.id("taskRuns"),
    newBranch: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Task run not found");
    }
    await ctx.db.patch(args.id, {
      newBranch: args.newBranch,
      updatedAt: Date.now(),
    });
    return { ok: true };
  },
});

// Internal query to get a task run by ID
export const getById = internalQuery({
  args: { id: v.id("taskRuns") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const updateStatusPublic = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    status: v.union(
      v.literal("pending"),
      v.literal("running"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const now = Date.now();
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    const updates: {
      status: typeof args.status;
      updatedAt: number;
      completedAt?: number;
      exitCode?: number;
    } = {
      status: args.status,
      updatedAt: now,
    };

    if (args.status === "completed" || args.status === "failed") {
      updates.completedAt = now;
      if (args.exitCode !== undefined) {
        updates.exitCode = args.exitCode;
      }
    }

    await ctx.db.patch(args.id, updates);

    // After updating to a terminal status, check if we should update the task status
    if (args.status === "completed" || args.status === "failed") {
      await updateTaskStatusFromRuns(ctx, doc.taskId, teamId, userId);

      // D4.3: Update parent run if this is a child run
      const updatedDoc = await ctx.db.get(args.id);
      if (updatedDoc) {
        await updateParentRunOnChildComplete(ctx, updatedDoc);
      }

      // Create a notification for the user (also marks as unread)
      console.log("[taskNotifications] Creating notification (crown)", {
        taskId: doc.taskId,
        taskRunId: args.id,
        type: args.status === "completed" ? "run_completed" : "run_failed",
      });
      await ctx.runMutation(internal.taskNotifications.createInternal, {
        taskId: doc.taskId,
        taskRunId: args.id,
        teamId,
        userId,
        type: args.status === "completed" ? "run_completed" : "run_failed",
      });
    }
  },
});

// Update VSCode instance information
export const updateVSCodeInstance = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    vscode: v.object({
      provider: runtimeProviderValidator,
      containerName: v.optional(v.string()),
      status: v.union(
        v.literal("starting"),
        v.literal("running"),
        v.literal("stopped"),
      ),
      statusMessage: v.optional(v.string()),
      ports: v.optional(
        v.object({
          vscode: v.string(),
          worker: v.string(),
          extension: v.optional(v.string()),
          proxy: v.optional(v.string()),
          vnc: v.optional(v.string()),
        }),
      ),
      url: v.optional(v.string()),
      workspaceUrl: v.optional(v.string()),
      vncUrl: v.optional(v.string()),
      xtermUrl: v.optional(v.string()),
      startedAt: v.optional(v.number()),
      stoppedAt: v.optional(v.number()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      vscode: args.vscode,
      updatedAt: Date.now(),
    });
  },
});

// Update VSCode instance status
export const updateVSCodeStatus = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    status: v.union(
      v.literal("starting"),
      v.literal("running"),
      v.literal("stopped"),
    ),
    stoppedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("Task run not found");
    }
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const vscode = run.vscode || {
      provider: "docker" as const,
      status: "starting" as const,
    };

    await ctx.db.patch(args.id, {
      vscode: {
        ...vscode,
        status: args.status,
        ...(args.stoppedAt ? { stoppedAt: args.stoppedAt } : {}),
      },
      updatedAt: Date.now(),
    });
  },
});

// Update VSCode instance ports
export const updateVSCodePorts = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    ports: v.object({
      vscode: v.string(),
      worker: v.string(),
      extension: v.optional(v.string()),
      proxy: v.optional(v.string()),
      vnc: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("Task run not found");
    }
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const vscode = run.vscode || {
      provider: "docker" as const,
      status: "starting" as const,
    };

    // Update ports and regenerate URLs with new port
    // Only regenerate if this is a Docker provider (localhost URLs)
    const newUrl =
      vscode.provider === "docker"
        ? `http://localhost:${args.ports.vscode}`
        : vscode.url;
    const newWorkspaceUrl =
      vscode.provider === "docker"
        ? `http://localhost:${args.ports.vscode}/?folder=/root/workspace`
        : vscode.workspaceUrl;

    await ctx.db.patch(args.id, {
      vscode: {
        ...vscode,
        ports: args.ports,
        url: newUrl,
        workspaceUrl: newWorkspaceUrl,
      },
      updatedAt: Date.now(),
    });
  },
});

// Update VSCode instance status message (for showing Docker pull progress, etc.)
export const updateVSCodeStatusMessage = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    statusMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("Task run not found");
    }
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const vscode = run.vscode || {
      provider: "docker" as const,
      status: "starting" as const,
    };

    await ctx.db.patch(args.id, {
      vscode: {
        ...vscode,
        statusMessage: args.statusMessage,
      },
      updatedAt: Date.now(),
    });
  },
});

// Get task run by VSCode container name
export const getByContainerName = authQuery({
  args: { teamSlugOrId: v.string(), containerName: v.string() },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const run =
      (await ctx.db
        .query("taskRuns")
        .withIndex("by_vscode_container_name", (q) =>
          q.eq("vscode.containerName", args.containerName),
        )
        .filter((q) => q.eq(q.field("teamId"), teamId))
        .first()) ?? null;

    if (!run) {
      return null;
    }

    if (run.networking) {
      return {
        ...run,
        networking: run.networking.map((item) => ({
          ...item,
          url: rewriteMorphUrl(item.url),
        })),
      };
    }

    return run;
  },
});

export const getCloudWorkspaceFlagsByContainerNamesInternal = internalQuery({
  args: {
    containerNames: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const containerNames = Array.from(
      new Set(args.containerNames.filter((containerName) => containerName.length > 0))
    );

    const flags = await Promise.all(
      containerNames.map(async (containerName) => {
        const runs = await ctx.db
          .query("taskRuns")
          .withIndex("by_vscode_container_name", (q) =>
            q.eq("vscode.containerName", containerName)
          )
          .collect();

        return [containerName, runs.some((run) => run.isCloudWorkspace === true)] as const;
      })
    );

    return Object.fromEntries(flags);
  },
});

/**
 * Check if the task associated with a container name is archived.
 * Used by iframe-preflight to prevent waking VMs for archived tasks.
 */
export const isTaskArchivedByContainerName = authQuery({
  args: { teamSlugOrId: v.string(), containerName: v.string() },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const run = await ctx.db
      .query("taskRuns")
      .withIndex("by_vscode_container_name", (q) =>
        q.eq("vscode.containerName", args.containerName),
      )
      .filter((q) => q.eq(q.field("teamId"), teamId))
      .first();

    if (!run) {
      // If we can't find the run, return false (not archived) to allow the request
      // This handles edge cases where container name doesn't match
      return { isArchived: false, found: false };
    }

    // Look up the parent task to check its archived status
    const task = await ctx.db.get(run.taskId);
    if (!task) {
      return { isArchived: false, found: false };
    }

    return { isArchived: task.isArchived === true, found: true };
  },
});

// Complete a task run
export const complete = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "completed",
      exitCode: args.exitCode ?? 0,
      completedAt: now,
      updatedAt: now,
    });

    // After marking this run as completed, check if we should update the task status
    await updateTaskStatusFromRuns(ctx, doc.taskId, teamId, userId);
  },
});

// Mark a task run as failed with an error message
export const fail = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    errorMessage: v.string(),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      exitCode: args.exitCode ?? 1,
      completedAt: now,
      updatedAt: now,
    });

    // After marking this run as failed, check if we should update the task status
    await updateTaskStatusFromRuns(ctx, doc.taskId, teamId, userId);
  },
});

/**
 * Fail a task run as a team member (not necessarily the owner).
 * Used for cascading cancellation from orchestration tasks where any team
 * member can cancel tasks, not just the original owner.
 */
export const failByTeamMember = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    errorMessage: v.string(),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    // Only check team membership, not ownership
    if (!doc || doc.teamId !== teamId) {
      throw new Error("Task run not found or unauthorized");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: "failed",
      errorMessage: args.errorMessage,
      exitCode: args.exitCode ?? 1,
      completedAt: now,
      updatedAt: now,
    });
    // Update task status using the original owner's userId for consistency
    await updateTaskStatusFromRuns(ctx, doc.taskId, teamId, doc.userId);
  },
});

export const addCustomPreview = authMutation({
  args: {
    teamSlugOrId: v.string(),
    runId: v.id("taskRuns"),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.runId);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    const newPreview = {
      url: args.url,
      createdAt: Date.now(),
    };

    const customPreviews = doc.customPreviews || [];
    const index = customPreviews.length;
    
    await ctx.db.patch(args.runId, {
      customPreviews: [...customPreviews, newPreview],
      updatedAt: Date.now(),
    });

    return index;
  },
});

export const removeCustomPreview = authMutation({
  args: {
    teamSlugOrId: v.string(),
    runId: v.id("taskRuns"),
    index: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.runId);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    const customPreviews = doc.customPreviews || [];
    const updated = customPreviews.filter((_, i) => i !== args.index);

    await ctx.db.patch(args.runId, {
      customPreviews: updated,
      updatedAt: Date.now(),
    });
  },
});

export const updateCustomPreviewUrl = authMutation({
  args: {
    teamSlugOrId: v.string(),
    runId: v.id("taskRuns"),
    index: v.number(),
    url: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.runId);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    const customPreviews = doc.customPreviews || [];
    if (args.index < 0 || args.index >= customPreviews.length) {
      throw new Error("Invalid preview index");
    }

    const updated = customPreviews.map((preview, i) =>
      i === args.index
        ? { ...preview, url: args.url }
        : preview
    );

    await ctx.db.patch(args.runId, {
      customPreviews: updated,
      updatedAt: Date.now(),
    });
  },
});

export const listByTaskInternal = internalQuery({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .collect();
    return runs;
  },
});

export const listByTaskAndTeamInternal = internalQuery({
  args: { taskId: v.id("tasks"), teamId: v.string(), userId: v.string() },
  handler: async (ctx, args) => {
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter(
        (q) =>
          q.eq(q.field("teamId"), args.teamId) &&
          q.eq(q.field("userId"), args.userId),
      )
      .collect();
    return runs;
  },
});

export const workerComplete = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    exitCode: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      throw new Error("Task run not found");
    }

    const now = Date.now();

    await ctx.db.patch(args.taskRunId, {
      status: "completed",
      exitCode: args.exitCode ?? 0,
      completedAt: now,
      updatedAt: now,
    });

    // After marking this run as completed, check if we should update the task status
    await updateTaskStatusFromRuns(ctx, run.taskId, run.teamId, run.userId);

    // D4.3: Update parent run if this is a child run
    const updatedRun = await ctx.db.get(args.taskRunId);
    if (updatedRun) {
      await updateParentRunOnChildComplete(ctx, updatedRun);
    }

    // Notify orchestration worker of completion (handles orchestration-managed tasks)
    await ctx.scheduler.runAfter(
      0,
      internal.orchestrationWorker.handleTaskCompletion,
      {
        taskRunId: args.taskRunId,
        exitCode: args.exitCode,
      }
    );

    // Create feed event for team activity stream
    const task = await ctx.db.get(run.taskId);
    const eventTitle = `Task completed: ${task?.text?.slice(0, 60) ?? "Unknown task"}${(task?.text?.length ?? 0) > 60 ? "..." : ""}`;

    await ctx.runMutation(internal.feedEvents.create, {
      teamId: run.teamId,
      userId: run.userId,
      eventType: "task_completed",
      title: eventTitle,
      taskId: run.taskId,
      taskRunId: args.taskRunId,
      agentName: run.agentName,
      repoFullName: task?.projectFullName,
    });

    // Note: Notifications are handled separately via /api/notifications/agent-stopped
    // which is called by the stop hook. This keeps status updates decoupled from notifications.

    return run;
  },
});

// Get all active VSCode instances
export const getActiveVSCodeInstances = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .collect();
    return runs
      .filter(
        (run) =>
          run.vscode &&
          (run.vscode.status === "starting" || run.vscode.status === "running"),
      )
      .map((run) => {
        if (run.networking) {
          return {
            ...run,
            networking: run.networking.map((item) => ({
              ...item,
              url: rewriteMorphUrl(item.url),
            })),
          };
        }
        return run;
      });
  },
});

// Update last accessed time for a container
export const updateLastAccessed = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const run = await ctx.db.get(args.id);
    if (!run || !run.vscode) {
      throw new Error("Task run or VSCode instance not found");
    }
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      vscode: {
        ...run.vscode,
        lastAccessedAt: Date.now(),
      },
      updatedAt: Date.now(),
    });
  },
});

// Toggle keep alive status for a container
export const toggleKeepAlive = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    keepAlive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const run = await ctx.db.get(args.id);
    if (!run || !run.vscode) {
      throw new Error("Task run or VSCode instance not found");
    }
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      vscode: {
        ...run.vscode,
        keepAlive: args.keepAlive,
        scheduledStopAt: args.keepAlive
          ? undefined
          : run.vscode.scheduledStopAt,
      },
      updatedAt: Date.now(),
    });
  },
});

export const updateVSCodeMetadataInternal = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    vscode: v.optional(
      v.object({
        provider: v.optional(
          runtimeProviderValidator,
        ),
        containerName: v.optional(v.string()),
        status: v.optional(
          v.union(v.literal("starting"), v.literal("running"), v.literal("stopped")),
        ),
        ports: v.optional(
          v.object({
            vscode: v.string(),
            worker: v.string(),
            extension: v.optional(v.string()),
            proxy: v.optional(v.string()),
            vnc: v.optional(v.string()),
          }),
        ),
        url: v.optional(v.string()),
        workspaceUrl: v.optional(v.string()),
        vncUrl: v.optional(v.string()),
        xtermUrl: v.optional(v.string()),
        startedAt: v.optional(v.number()),
        stoppedAt: v.optional(v.number()),
        lastAccessedAt: v.optional(v.number()),
        keepAlive: v.optional(v.boolean()),
        scheduledStopAt: v.optional(v.number()),
      }),
    ),
    networking: v.optional(
      v.array(
        v.object({
          status: v.union(
            v.literal("starting"),
            v.literal("running"),
            v.literal("stopped"),
          ),
          port: v.number(),
          url: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run) {
      throw new Error("Task run not found");
    }

    const patch: Partial<Doc<"taskRuns">> = {
      updatedAt: Date.now(),
    };

    if (args.vscode) {
      const existing = run.vscode;
      const ensureField = <T>(value: T | undefined, existingValue: T | undefined, field: string): T => {
        if (value !== undefined) {
          return value;
        }
        if (existingValue !== undefined) {
          return existingValue;
        }
        throw new Error(`Missing required VSCode field: ${field}`);
      };

      const provider = ensureField(args.vscode.provider, existing?.provider, "provider");
      const status = ensureField(args.vscode.status, existing?.status, "status");

      patch.vscode = {
        ...existing,
        ...args.vscode,
        provider,
        status,
      };
    }

    if (args.networking !== undefined) {
      patch.networking = args.networking;
    }

    await ctx.db.patch(args.taskRunId, patch);
  },
});

export const updateScheduledStopInternal = internalMutation({
  args: {
    taskRunId: v.id("taskRuns"),
    scheduledStopAt: v.number(),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.taskRunId);
    if (!run || !run.vscode) {
      return;
    }

    await ctx.db.patch(args.taskRunId, {
      vscode: {
        ...run.vscode,
        scheduledStopAt: args.scheduledStopAt,
      },
      updatedAt: Date.now(),
    });
  },
});

// Update pull request URL for a task run
export const updatePullRequestUrl = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    pullRequestUrl: v.string(),
    isDraft: v.optional(v.boolean()),
    state: v.optional(
      v.union(
        v.literal("none"),
        v.literal("draft"),
        v.literal("open"),
        v.literal("merged"),
        v.literal("closed"),
        v.literal("unknown"),
      ),
    ),
    number: v.optional(v.number()),
    pullRequests: v.optional(
      v.array(
        v.object({
          repoFullName: v.string(),
          url: v.optional(v.string()),
          number: v.optional(v.number()),
          state: v.union(
            v.literal("none"),
            v.literal("draft"),
            v.literal("open"),
            v.literal("merged"),
            v.literal("closed"),
            v.literal("unknown"),
          ),
          isDraft: v.optional(v.boolean()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const run = await ctx.db.get(args.id);
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!run || run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    const updates: Partial<Doc<"taskRuns">> = {
      pullRequestUrl: args.pullRequestUrl,
      updatedAt: Date.now(),
    };
    if (args.isDraft !== undefined) {
      updates.pullRequestIsDraft = args.isDraft;
    }
    if (args.state) {
      updates.pullRequestState = args.state;
    }
    if (args.number !== undefined) {
      updates.pullRequestNumber = args.number;
    }
    const normalizedPullRequests = normalizePullRequestRecords(
      args.pullRequests,
    );
    if (normalizedPullRequests) {
      updates.pullRequests = normalizedPullRequests;
      const aggregate = aggregatePullRequestState(normalizedPullRequests);
      updates.pullRequestState = aggregate.state;
      updates.pullRequestIsDraft = aggregate.isDraft;
      updates.pullRequestUrl =
        aggregate.url !== undefined ? aggregate.url : updates.pullRequestUrl;
      updates.pullRequestNumber =
        aggregate.number !== undefined
          ? aggregate.number
          : updates.pullRequestNumber;
    }
    await ctx.db.patch(args.id, updates);

    // Sync the lookup table for PR URL -> taskRun mapping
    if (normalizedPullRequests) {
      await syncTaskRunPullRequests(ctx, args.id, teamId, normalizedPullRequests);
    }
  },
});

export const updatePullRequestState = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    state: v.union(
      v.literal("none"),
      v.literal("draft"),
      v.literal("open"),
      v.literal("merged"),
      v.literal("closed"),
      v.literal("unknown"),
    ),
    isDraft: v.optional(v.boolean()),
    number: v.optional(v.number()),
    url: v.optional(v.string()),
    pullRequests: v.optional(
      v.array(
        v.object({
          repoFullName: v.string(),
          url: v.optional(v.string()),
          number: v.optional(v.number()),
          state: v.union(
            v.literal("none"),
            v.literal("draft"),
            v.literal("open"),
            v.literal("merged"),
            v.literal("closed"),
            v.literal("unknown"),
          ),
          isDraft: v.optional(v.boolean()),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const run = await ctx.db.get(args.id);
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!run || run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    const updates: Partial<Doc<"taskRuns">> = {
      pullRequestState: args.state,
      updatedAt: Date.now(),
    };
    if (args.isDraft !== undefined) {
      updates.pullRequestIsDraft = args.isDraft;
    }
    if (args.number !== undefined) {
      updates.pullRequestNumber = args.number;
    }
    if (args.url !== undefined) {
      updates.pullRequestUrl = args.url;
    }
    const normalizedPullRequests = normalizePullRequestRecords(
      args.pullRequests,
    );
    if (normalizedPullRequests) {
      updates.pullRequests = normalizedPullRequests;
      const aggregate = aggregatePullRequestState(normalizedPullRequests);
      updates.pullRequestState = aggregate.state;
      updates.pullRequestIsDraft = aggregate.isDraft;
      updates.pullRequestUrl =
        aggregate.url !== undefined ? aggregate.url : updates.pullRequestUrl;
      updates.pullRequestNumber =
        aggregate.number !== undefined
          ? aggregate.number
          : updates.pullRequestNumber;
    }
    await ctx.db.patch(args.id, updates);

    // Sync the lookup table for PR URL -> taskRun mapping
    if (normalizedPullRequests) {
      await syncTaskRunPullRequests(ctx, args.id, teamId, normalizedPullRequests);
    }
  },
});

// Update networking information for a task run
export const updateNetworking = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    networking: v.array(
      v.object({
        status: v.union(
          v.literal("starting"),
          v.literal("running"),
          v.literal("stopped"),
        ),
        port: v.number(),
        url: v.string(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const run = await ctx.db.get(args.id);
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    if (!run || run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      networking: args.networking,
      updatedAt: Date.now(),
    });
  },
});

async function performUpdateEnvironmentError(
  ctx: MutationCtx,
  args: {
    id: Id<"taskRuns">;
    teamId: string;
    userId: string;
    maintenanceError?: string;
    devError?: string;
  },
) {
  const run = await ctx.db.get(args.id);

  if (!run) {
    throw new Error("Task run not found");
  }

  if (run.teamId !== args.teamId || run.userId !== args.userId) {
    throw new Error("Task run mismatch for provided credentials");
  }

  const environmentError = normalizeEnvironmentErrorPayload(
    args.maintenanceError,
    args.devError,
  );

  await ctx.db.patch(args.id, {
    environmentError,
    updatedAt: Date.now(),
  });
}

export const updateEnvironmentErrorFromWorker = internalMutation({
  args: {
    id: v.id("taskRuns"),
    teamId: v.string(),
    userId: v.string(),
    maintenanceError: v.optional(v.string()),
    devError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await performUpdateEnvironmentError(ctx, args);
  },
});

export const updateEnvironmentError = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    maintenanceError: v.optional(v.string()),
    devError: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    await performUpdateEnvironmentError(ctx, {
      id: args.id,
      teamId,
      userId,
      maintenanceError: args.maintenanceError,
      devError: args.devError,
    });
  },
});

/**
 * Update discovered repos for a task run (internal, from server)
 * Called when scanning sandbox for git repos in custom environment tasks
 */
export const updateDiscoveredReposInternal = internalMutation({
  args: {
    runId: v.id("taskRuns"),
    discoveredRepos: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) {
      throw new Error("Task run not found");
    }
    await ctx.db.patch(args.runId, {
      discoveredRepos: args.discoveredRepos,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update discovered repos for a task run (authenticated, from client)
 * Allows UI to trigger repo discovery and update the task run
 */
export const updateDiscoveredRepos = authMutation({
  args: {
    teamSlugOrId: v.string(),
    runId: v.id("taskRuns"),
    discoveredRepos: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const run = await ctx.db.get(args.runId);
    if (!run || run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    await ctx.db.patch(args.runId, {
      discoveredRepos: args.discoveredRepos,
      updatedAt: Date.now(),
    });
  },
});

export const archive = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    archive: v.boolean(),
    includeChildren: v.optional(v.boolean()),
    taskId: v.optional(v.id("tasks")),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    const run = await ctx.db.get(args.id);
    if (!run || run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    if (args.taskId && run.taskId !== args.taskId) {
      throw new Error("Task run does not belong to provided task");
    }

    const targetIds = args.includeChildren
      ? await collectRunSubtreeIds(ctx, args.id, teamId, userId)
      : [args.id];

    await Promise.all(
      targetIds.map((runId) =>
        ctx.db.patch(runId, {
          isArchived: args.archive,
          updatedAt: Date.now(),
        }),
      ),
    );

    // Recalculate selectedTaskRunId if we archived/unarchived a run that might affect the selection
    const task = await ctx.db.get(run.taskId);
    if (task) {
      const targetIdsSet = new Set(targetIds);
      // Need to recalculate if:
      // 1. We archived the currently selected run, OR
      // 2. We unarchived runs (might have unarchived a crowned run or newer run)
      const needsRecalculation =
        (args.archive && task.selectedTaskRunId && targetIdsSet.has(task.selectedTaskRunId)) ||
        !args.archive;

      if (needsRecalculation) {
        await ctx.runMutation(internal.taskRuns.updateSelectedTaskRunForTask, {
          taskId: run.taskId,
        });
      }
    }
  },
});

// Get containers that should be stopped based on TTL and settings
export const getContainersToStop = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("containerSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();
    const autoCleanupEnabled = settings?.autoCleanupEnabled ?? true;
    const minContainersToKeep = settings?.minContainersToKeep ?? 0;

    if (!autoCleanupEnabled) {
      return [];
    }

    const now = Date.now();
    const activeRuns = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .collect();

    const runningContainers = activeRuns.filter(
      (run) =>
        run.vscode && run.vscode.status === "running" && !run.vscode.keepAlive, // Don't stop containers marked as keep alive
    );

    // Sort containers by creation time (newest first) to identify which to keep
    const sortedContainers = [...runningContainers].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );

    // Get IDs of the most recent N containers to keep
    const containersToKeepIds = new Set(
      sortedContainers.slice(0, minContainersToKeep).map((c) => c._id),
    );

    // Filter containers that have exceeded their scheduled stop time AND are not in the keep set
    const containersToStop = runningContainers
      .filter(
        (run) =>
          run.vscode!.scheduledStopAt &&
          run.vscode!.scheduledStopAt <= now &&
          !containersToKeepIds.has(run._id),
      )
      .map((run) => {
        if (run.networking) {
          return {
            ...run,
            networking: run.networking.map((item) => ({
              ...item,
              url: rewriteMorphUrl(item.url),
            })),
          };
        }
        return run;
      });

    return containersToStop;
  },
});

// Get running containers sorted by priority for cleanup
export const getRunningContainersByCleanupPriority = authQuery({
  args: { teamSlugOrId: v.string() },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const settings = await ctx.db
      .query("containerSettings")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .first();
    const minContainersToKeep = settings?.minContainersToKeep ?? 0;

    const activeRuns = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", teamId).eq("userId", userId),
      )
      .collect();

    const runningContainers = activeRuns.filter(
      (run) =>
        run.vscode && run.vscode.status === "running" && !run.vscode.keepAlive, // Don't include keep-alive containers in cleanup consideration
    );

    // Sort all containers by creation time to identify which to keep
    const sortedByCreation = [...runningContainers].sort(
      (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    );

    // Get IDs of the most recent N containers to keep
    const containersToKeepIds = new Set(
      sortedByCreation.slice(0, minContainersToKeep).map((c) => c._id),
    );

    // Filter out containers that should be kept
    const eligibleForCleanup = runningContainers.filter(
      (c) => !containersToKeepIds.has(c._id),
    );

    // Categorize eligible containers
    const now = Date.now();
    const activeContainers: typeof eligibleForCleanup = [];
    const reviewContainers: typeof eligibleForCleanup = [];

    for (const container of eligibleForCleanup) {
      // If task is still running or was recently completed (within 5 minutes)
      if (
        container.status === "running" ||
        container.status === "pending" ||
        (container.completedAt && now - container.completedAt < 5 * 60 * 1000)
      ) {
        activeContainers.push(container);
      } else {
        reviewContainers.push(container);
      }
    }

    // Sort review containers by scheduled stop time (earliest first)
    reviewContainers.sort((a, b) => {
      const aTime = a.vscode!.scheduledStopAt || Infinity;
      const bTime = b.vscode!.scheduledStopAt || Infinity;
      return aTime - bTime;
    });

    // Helper to rewrite networking URLs
    const rewriteContainerNetworking = <
      T extends (typeof eligibleForCleanup)[number],
    >(
      container: T,
    ): T => {
      if (container.networking) {
        return {
          ...container,
          networking: container.networking.map((item) => ({
            ...item,
            url: rewriteMorphUrl(item.url),
          })),
        };
      }
      return container;
    };

    // Rewrite networking URLs in all containers
    const reviewContainersWithRewrittenUrls = reviewContainers.map(
      rewriteContainerNetworking,
    );
    const activeContainersWithRewrittenUrls = activeContainers.map(
      rewriteContainerNetworking,
    );

    // Return containers in cleanup priority order:
    // 1. Review period containers (oldest scheduled first)
    // 2. Active containers (only if absolutely necessary)
    return {
      total: runningContainers.length,
      reviewContainers: reviewContainersWithRewrittenUrls,
      activeContainers: activeContainersWithRewrittenUrls,
      prioritizedForCleanup: [
        ...reviewContainersWithRewrittenUrls,
        ...activeContainersWithRewrittenUrls,
      ],
      protectedCount: containersToKeepIds.size,
    };
  },
});

export const createForPreview = internalMutation({
  args: {
    taskId: v.id("tasks"),
    teamId: v.string(),
    userId: v.string(),
    prUrl: v.string(),
    environmentId: v.optional(v.id("environments")),
    newBranch: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      throw new Error("Task not found");
    }

    const taskRunId = await ctx.db.insert("taskRuns", {
      taskId: args.taskId,
      parentRunId: undefined,
      prompt: `Capture UI screenshots for ${args.prUrl}`,
      agentName: "screenshot-collector",
      newBranch: args.newBranch,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      userId: args.userId,
      teamId: args.teamId,
      environmentId: args.environmentId,
      isLocalWorkspace: task.isLocalWorkspace,
      isCloudWorkspace: task.isCloudWorkspace,
      isPreviewJob: true,
    });

    // Update task's lastActivityAt for sorting
    await ctx.db.patch(args.taskId, { lastActivityAt: now });

    const jwt = await new SignJWT({
      taskRunId,
      teamId: args.teamId,
      userId: args.userId,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime(getJwtTtl(task.isCloudWorkspace))
      .sign(new TextEncoder().encode(env.CMUX_TASK_RUN_JWT_SECRET));

    return { taskRunId, jwt };
  },
});

/**
 * Internal mutation to recalculate and update the selectedTaskRunId for a task.
 * Selects the crowned run if one exists, otherwise falls back to the latest non-archived run.
 */
export const updateSelectedTaskRunForTask = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) {
      return;
    }

    // Find crowned run first
    const crownedRun = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.eq(q.field("isCrowned"), true))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .first();

    if (crownedRun) {
      await ctx.db.patch(args.taskId, { selectedTaskRunId: crownedRun._id });
      return;
    }

    // Fall back to latest non-archived run
    const latestRun = await ctx.db
      .query("taskRuns")
      .withIndex("by_task", (q) => q.eq("taskId", args.taskId))
      .filter((q) => q.neq(q.field("isArchived"), true))
      .order("desc")
      .first();

    await ctx.db.patch(args.taskId, {
      selectedTaskRunId: latestRun?._id,
    });
  },
});

/**
 * Update starting commit SHA for a task run (used for diff baseline in custom environments).
 * Called after hydration completes to capture the commit SHA before the agent runs.
 */
export const updateStartingCommitSha = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    startingCommitSha: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const run = await ctx.db.get(args.id);
    if (!run) {
      throw new Error("Task run not found");
    }
    if (run.teamId !== teamId || run.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.id, {
      startingCommitSha: args.startingCommitSha,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// D4.2: Agent Teams - Parent-Child Task Relationship Queries
// ============================================================================

/**
 * Get all child task runs for a given parent task run.
 * Returns immediate children only (not recursive).
 */
export const listChildRuns = authQuery({
  args: {
    teamSlugOrId: v.string(),
    parentRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Verify parent run exists and belongs to the team.
    // Returns null (not throw) so React useQuery() doesn't crash the error boundary.
    const parentRun = await ctx.db.get(args.parentRunId);
    if (!parentRun || parentRun.teamId !== teamId) {
      return null;
    }

    const children = await ctx.db
      .query("taskRuns")
      .withIndex("by_parent", (q) => q.eq("parentRunId", args.parentRunId))
      .collect();

    // Filter by team access (same as getByTask pattern)
    return children.filter((run) => run.teamId === teamId);
  },
});

/**
 * Get parent task run info for a given child task run.
 * Returns null if the run has no parent.
 */
export const getParentRun = authQuery({
  args: {
    teamSlugOrId: v.string(),
    runId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Throws for invalid/unauthorized run - safe because this query is only called
    // from the HTTP handler (cmux_http.ts) which has try/catch for 404 mapping.
    const run = await ctx.db.get(args.runId);
    if (!run || run.teamId !== teamId) {
      throw new Error("Task run not found or unauthorized");
    }

    if (!run.parentRunId) {
      return null;
    }

    const parentRun = await ctx.db.get(run.parentRunId);
    if (!parentRun || parentRun.teamId !== teamId) {
      return null; // Parent exists but not accessible
    }

    return parentRun;
  },
});

/**
 * Get aggregated status of all child runs for a parent.
 * Returns counts by status and overall completion state.
 */
export const getChildRunsStatus = authQuery({
  args: {
    teamSlugOrId: v.string(),
    parentRunId: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);

    // Verify parent run exists and belongs to the team.
    // Returns null (not throw) so React useQuery() doesn't crash the error boundary.
    const parentRun = await ctx.db.get(args.parentRunId);
    if (!parentRun || parentRun.teamId !== teamId) {
      return null;
    }

    const children = await ctx.db
      .query("taskRuns")
      .withIndex("by_parent", (q) => q.eq("parentRunId", args.parentRunId))
      .collect();

    // Filter by team access (same as getByTask pattern)
    const accessibleChildren = children.filter(
      (run) => run.teamId === teamId
    );

    const statusCounts: Record<string, number> = {
      pending: 0,
      running: 0,
      completed: 0,
      failed: 0,
      skipped: 0,
    };

    for (const child of accessibleChildren) {
      statusCounts[child.status] = (statusCounts[child.status] || 0) + 1;
    }

    const total = accessibleChildren.length;
    const terminal = statusCounts.completed + statusCounts.failed + statusCounts.skipped;
    const allComplete = total > 0 && terminal === total;
    const anyFailed = statusCounts.failed > 0;
    const allSucceeded = total > 0 && statusCounts.completed === total;

    return {
      total,
      statusCounts,
      allComplete,
      anyFailed,
      allSucceeded,
      childRunIds: accessibleChildren.map((c) => c._id),
    };
  },
});

/**
 * Update PTY session info for terminal attachment/reconnection.
 * Called by agentSpawner when terminal is created.
 */
export const updatePtySession = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    ptySessionId: v.string(),
    ptyBackend: v.union(v.literal("cmux-pty"), v.literal("tmux")),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }
    await ctx.db.patch(args.id, {
      ptySessionId: args.ptySessionId,
      ptyBackend: args.ptyBackend,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Get running task runs for a team with PTY session info.
 * Used by VSCode extension for terminal reconnection on reload.
 */
export const getRunningWithPty = authQuery({
  args: {
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const runs = await ctx.db
      .query("taskRuns")
      .withIndex("by_team_user_status_created", (q) =>
        q.eq("teamId", teamId).eq("userId", ctx.identity.subject).eq("status", "running")
      )
      .collect();

    // Return only runs with PTY session info
    return runs
      .filter((run) => run.ptySessionId)
      .map((run) => ({
        _id: run._id,
        taskId: run.taskId,
        agentName: run.agentName,
        ptySessionId: run.ptySessionId,
        ptyBackend: run.ptyBackend,
        vscode: run.vscode,
      }));
  },
});

// ============================================================================
// Autopilot Mutations (Phase 6: Long-Running Sessions)
// ============================================================================

/**
 * Update autopilot heartbeat timestamp.
 * Called periodically by autopilot wrapper script in sandbox.
 */
export const updateAutopilotHeartbeat = internalMutation({
  args: {
    id: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Task run not found");
    }
    if (!doc.autopilotConfig) {
      throw new Error("Task run is not in autopilot mode");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      autopilotConfig: {
        ...doc.autopilotConfig,
        lastHeartbeat: now,
      },
      updatedAt: now,
    });

    return { ok: true, lastHeartbeat: now };
  },
});

/**
 * Update autopilot status (running/paused/wrap-up/completed/stopped).
 * Called by autopilot wrapper script when status changes.
 */
export const updateAutopilotStatus = internalMutation({
  args: {
    id: v.id("taskRuns"),
    status: v.union(
      v.literal("running"),
      v.literal("paused"),
      v.literal("wrap-up"),
      v.literal("completed"),
      v.literal("stopped")
    ),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Task run not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      autopilotStatus: args.status,
      updatedAt: now,
    });

    return { ok: true, status: args.status };
  },
});

/**
 * Store Codex thread-id for session resume.
 * Called by sandbox when codex notify hook receives thread_id.
 */
export const updateCodexThreadId = internalMutation({
  args: {
    id: v.id("taskRuns"),
    threadId: v.string(),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Task run not found");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      codexThreadId: args.threadId,
      updatedAt: now,
    });

    return { ok: true, threadId: args.threadId };
  },
});

/**
 * Update orchestration head agent heartbeat.
 * Called by push_orchestration_updates MCP tool via POST /sync endpoint.
 */
export const updateOrchestrationHeartbeat = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    status: v.optional(
      v.union(
        v.literal("running"),
        v.literal("completed"),
        v.literal("failed")
      )
    ),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      throw new Error("Task run not found");
    }
    if (doc.teamId !== teamId) {
      throw new Error("Task run not found or unauthorized");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = {
      orchestrationHeartbeat: now,
      updatedAt: now,
    };

    if (args.status) {
      patch.orchestrationStatus = args.status;
    }

    await ctx.db.patch(args.id, patch);

    return { ok: true, heartbeat: now, status: args.status };
  },
});

/**
 * Get task run by orchestration ID (for head agent lookup).
 */
export const getByOrchestrationId = authQuery({
  args: {
    orchestrationId: v.string(),
    teamSlugOrId: v.string(),
  },
  handler: async (ctx, args) => {
    const teamId = await getTeamId(ctx, args.teamSlugOrId);

    // Look for head agent task run with this orchestration ID
    // Note: No direct index on orchestrationId, so we filter
    const run = await ctx.db
      .query("taskRuns")
      .filter((q) =>
        q.and(
          q.eq(q.field("teamId"), teamId),
          q.eq(q.field("orchestrationId"), args.orchestrationId),
          q.eq(q.field("isOrchestrationHead"), true)
        )
      )
      .first();

    return run;
  },
});

// Head agent heartbeat timeout: 30 minutes without heartbeat = stale
const HEAD_AGENT_HEARTBEAT_TIMEOUT_MS = 30 * 60 * 1000;

/**
 * Check for stale orchestration head agents.
 * Head agents are considered stale if:
 * - isOrchestrationHead is true
 * - orchestrationStatus is "running"
 * - orchestrationHeartbeat is older than 30 minutes (or never set)
 *
 * Called by cron job to detect and mark stale head agents.
 */
export const checkStaleHeadAgents = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const cutoff = now - HEAD_AGENT_HEARTBEAT_TIMEOUT_MS;

    // Find running head agents with stale heartbeats
    const staleRuns = await ctx.db
      .query("taskRuns")
      .filter((q) =>
        q.and(
          q.eq(q.field("isOrchestrationHead"), true),
          q.eq(q.field("orchestrationStatus"), "running")
        )
      )
      .collect();

    let staleCount = 0;
    for (const run of staleRuns) {
      const lastHeartbeat = run.orchestrationHeartbeat ?? run.createdAt;
      if (lastHeartbeat < cutoff) {
        // Mark as failed due to timeout
        await ctx.db.patch(run._id, {
          orchestrationStatus: "failed",
          updatedAt: now,
        });
        console.log(`[taskRuns] Marked stale head agent as failed: ${run._id}`, {
          orchestrationId: run.orchestrationId,
          lastHeartbeat: new Date(lastHeartbeat).toISOString(),
          staleMinutes: Math.round((now - lastHeartbeat) / 60000),
        });
        staleCount++;
      }
    }

    return { checkedCount: staleRuns.length, staleCount };
  },
});

/**
 * Initialize autopilot config when starting an autopilot session.
 * Called by agentSpawner when task is created with --autopilot flag.
 */
export const initializeAutopilot = authMutation({
  args: {
    teamSlugOrId: v.string(),
    id: v.id("taskRuns"),
    totalMinutes: v.number(),
    turnMinutes: v.number(),
    wrapUpMinutes: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = ctx.identity.subject;
    const teamId = await resolveTeamIdLoose(ctx, args.teamSlugOrId);
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.teamId !== teamId || doc.userId !== userId) {
      throw new Error("Task run not found or unauthorized");
    }

    const now = Date.now();
    await ctx.db.patch(args.id, {
      autopilotConfig: {
        enabled: true,
        totalMinutes: args.totalMinutes,
        turnMinutes: args.turnMinutes,
        wrapUpMinutes: args.wrapUpMinutes,
        startedAt: now,
        lastHeartbeat: now,
      },
      autopilotStatus: "running",
      updatedAt: now,
    });

    return { ok: true, startedAt: now };
  },
});

/**
 * Update context usage tracking for a task run (Phase 5c).
 * Called from anthropic_http when token usage is available.
 */
// Context warning thresholds
const CONTEXT_WARNING_THRESHOLD = 80; // Emit warning at 80%
const CONTEXT_CRITICAL_THRESHOLD = 95; // Emit critical at 95%

export const updateContextUsage = internalMutation({
  args: {
    id: v.id("taskRuns"),
    inputTokens: v.number(),
    outputTokens: v.number(),
    contextWindow: v.optional(v.number()),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      return null;
    }

    const existing = doc.contextUsage;
    const totalInputTokens = (existing?.totalInputTokens ?? 0) + args.inputTokens;
    const totalOutputTokens = (existing?.totalOutputTokens ?? 0) + args.outputTokens;
    const contextWindow = args.contextWindow ?? existing?.contextWindow;

    // Calculate usage percentage if we have context window size
    // Note: input tokens contribute to context, output tokens are generated
    const usagePercent = contextWindow
      ? Math.round((totalInputTokens / contextWindow) * 100)
      : undefined;

    const previousUsagePercent = existing?.usagePercent;

    await ctx.db.patch(args.id, {
      contextUsage: {
        totalInputTokens,
        totalOutputTokens,
        contextWindow,
        usagePercent,
        lastUpdated: Date.now(),
      },
    });

    // Emit context_warning event when crossing thresholds
    if (usagePercent !== undefined && contextWindow) {
      const crossedWarning = previousUsagePercent !== undefined
        ? previousUsagePercent < CONTEXT_WARNING_THRESHOLD && usagePercent >= CONTEXT_WARNING_THRESHOLD
        : usagePercent >= CONTEXT_WARNING_THRESHOLD;
      const crossedCritical = previousUsagePercent !== undefined
        ? previousUsagePercent < CONTEXT_CRITICAL_THRESHOLD && usagePercent >= CONTEXT_CRITICAL_THRESHOLD
        : usagePercent >= CONTEXT_CRITICAL_THRESHOLD;

      if (crossedWarning || crossedCritical) {
        const severity = crossedCritical ? "critical" : "warning";
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 10);
        const eventId = `evt_${timestamp}_${random}`;

        // Log the context warning event
        await ctx.runMutation(internal.orchestrationEvents.logEventInternal, {
          teamId: doc.teamId,
          eventId,
          orchestrationId: doc.orchestrationId ?? args.id,
          eventType: "context_warning",
          taskRunId: args.id,
          payload: {
            provider: args.provider ?? doc.agentName ?? "unknown",
            severity,
            warningType: "capacity",
            summary: `Context window at ${usagePercent}% capacity (${totalInputTokens.toLocaleString()} / ${contextWindow.toLocaleString()} tokens)`,
            currentUsage: totalInputTokens,
            maxCapacity: contextWindow,
            usagePercent,
          },
        });
      }
    }

    return { totalInputTokens, totalOutputTokens, usagePercent };
  },
});

/**
 * Get context usage for a task run (Phase 5c).
 */
export const getContextUsage = internalQuery({
  args: {
    id: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    return doc?.contextUsage ?? null;
  },
});

/**
 * Get context health summary for a task run (Phase 4).
 * Aggregates context usage and recent warning events into a compact summary.
 */
export const getContextHealthSummary = internalQuery({
  args: {
    id: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      return null;
    }

    const contextUsage = doc.contextUsage;
    const orchestrationId = doc.orchestrationId ?? args.id;

    // Get recent context_warning events for this task run
    const recentWarnings = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_type", (q) =>
        q.eq("orchestrationId", orchestrationId).eq("eventType", "context_warning")
      )
      .order("desc")
      .take(5);

    // Determine latest severity from warnings
    let latestWarningSeverity: "info" | "warning" | "critical" | null = null;
    const warningReasons: string[] = [];

    for (const event of recentWarnings) {
      const payload = event.payload as { severity?: string; summary?: string } | undefined;
      if (payload?.severity) {
        if (!latestWarningSeverity || payload.severity === "critical") {
          latestWarningSeverity = payload.severity as "info" | "warning" | "critical";
        }
      }
      if (payload?.summary && !warningReasons.includes(payload.summary)) {
        warningReasons.push(payload.summary);
      }
    }

    // Get recent context_compacted events
    const recentCompactions = await ctx.db
      .query("orchestrationEvents")
      .withIndex("by_orchestration_type", (q) =>
        q.eq("orchestrationId", orchestrationId).eq("eventType", "context_compacted")
      )
      .order("desc")
      .take(3);

    return {
      taskRunId: args.id,
      provider: doc.agentName ?? "unknown",
      // Context usage stats
      totalInputTokens: contextUsage?.totalInputTokens ?? 0,
      totalOutputTokens: contextUsage?.totalOutputTokens ?? 0,
      contextWindow: contextUsage?.contextWindow,
      usagePercent: contextUsage?.usagePercent,
      // Warning state
      latestWarningSeverity,
      topWarningReasons: warningReasons.slice(0, 3),
      warningCount: recentWarnings.length,
      // Compaction state
      recentCompactionCount: recentCompactions.length,
      // Timestamps
      lastUpdatedAt: contextUsage?.lastUpdated ?? doc.updatedAt,
    };
  },
});

/**
 * Get autopilot info for resume.
 * Returns thread-id and config for resuming an autopilot session.
 */
export const getAutopilotInfo = internalQuery({
  args: {
    id: v.id("taskRuns"),
  },
  handler: async (ctx, args) => {
    const doc = await ctx.db.get(args.id);
    if (!doc) {
      return null;
    }

    return {
      taskRunId: doc._id,
      taskId: doc.taskId,
      status: doc.status,
      autopilotConfig: doc.autopilotConfig,
      autopilotStatus: doc.autopilotStatus,
      codexThreadId: doc.codexThreadId,
      vscode: doc.vscode,
    };
  },
});
