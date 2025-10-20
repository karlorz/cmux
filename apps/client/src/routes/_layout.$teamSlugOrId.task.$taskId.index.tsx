import { TaskRunChatPane } from "@/components/TaskRunChatPane";
import { TaskRunTerminalPane } from "@/components/TaskRunTerminalPane";
import { FloatingPane } from "@/components/floating-pane";
import { TaskDetailHeader } from "@/components/task-detail-header";
import type { PersistentIframeStatus } from "@/components/persistent-iframe";
import { PersistentWebView } from "@/components/persistent-webview";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import {
  getTaskRunBrowserPersistKey,
  getTaskRunPersistKey,
} from "@/lib/persistent-webview-keys";
import {
  toMorphVncUrl,
  toProxyWorkspaceUrl,
} from "@/lib/toProxyWorkspaceUrl";
import {
  TASK_RUN_IFRAME_ALLOW,
  TASK_RUN_IFRAME_SANDBOX,
  preloadTaskRunIframes,
} from "../lib/preloadTaskRunIframes";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import clsx from "clsx";
import { Code2, Crown, Globe2, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import z from "zod";

type TaskRunListItem = (typeof api.taskRuns.getByTask._returnType)[number];

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
});

export const Route = createFileRoute("/_layout/$teamSlugOrId/task/$taskId/")({
  component: TaskDetailPage,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => ({
      taskId: params.taskId,
    }),
  },
  validateSearch: (search: Record<string, unknown>) => {
    const runId = typedZid("taskRuns").optional().parse(search.runId);
    return {
      runId,
    };
  },
  loader: async (opts) => {
    await Promise.all([
      opts.context.queryClient.ensureQueryData(
        convexQuery(api.taskRuns.getByTask, {
          teamSlugOrId: opts.params.teamSlugOrId,
          taskId: opts.params.taskId,
        }),
      ),
      opts.context.queryClient.ensureQueryData(
        convexQuery(api.tasks.getById, {
          teamSlugOrId: opts.params.teamSlugOrId,
          id: opts.params.taskId,
        }),
      ),
      opts.context.queryClient.ensureQueryData(
        convexQuery(api.crown.getCrownEvaluation, {
          teamSlugOrId: opts.params.teamSlugOrId,
          taskId: opts.params.taskId,
        }),
      ),
    ]);
  },
});

function flattenRunsWithDepth(
  runs: TaskRunListItem[],
): Array<TaskRunListItem & { depth: number }> {
  const result: Array<TaskRunListItem & { depth: number }> = [];

  const traverse = (run: TaskRunListItem, depth: number) => {
    result.push({ ...run, depth });
    run.children?.forEach((child) => traverse(child, depth + 1));
  };

  runs.forEach((run) => traverse(run, 0));
  return result;
}

function findRunById(
  runs: TaskRunListItem[],
  runId: TaskRunListItem["_id"],
): TaskRunListItem | null {
  for (const run of runs) {
    if (run._id === runId) {
      return run;
    }
    const childMatch = run.children ? findRunById(run.children, runId) : null;
    if (childMatch) {
      return childMatch;
    }
  }
  return null;
}

function findLatestRun(runs: TaskRunListItem[]): TaskRunListItem | null {
  let latest: TaskRunListItem | null = null;
  const queue = [...runs];
  while (queue.length) {
    const run = queue.shift();
    if (!run) {
      continue;
    }
    if (!latest || run.createdAt > latest.createdAt) {
      latest = run;
    }
    if (run.children?.length) {
      queue.push(...run.children);
    }
  }
  return latest;
}

function TaskDetailPage() {
  const { taskId, teamSlugOrId } = Route.useParams();
  const search = Route.useSearch();
  const { data: task } = useSuspenseQuery(
    convexQuery(api.tasks.getById, {
      teamSlugOrId,
      id: taskId,
    }),
  );
  const router = useRouter();
  const { data: taskRuns } = useSuspenseQuery(
    convexQuery(api.taskRuns.getByTask, {
      teamSlugOrId,
      taskId,
    }),
  );
  const { data: crownEvaluation } = useSuspenseQuery(
    convexQuery(api.crown.getCrownEvaluation, {
      teamSlugOrId,
      taskId,
    }),
  );

  const runsWithDepth = useMemo(
    () => flattenRunsWithDepth(taskRuns ?? []),
    [taskRuns],
  );

  const selectedRun = useMemo(() => {
    if (!taskRuns?.length) {
      return null;
    }
    const runFromSearch = search.runId
      ? findRunById(taskRuns, search.runId)
      : null;
    if (runFromSearch) {
      return runFromSearch;
    }
    return findLatestRun(taskRuns);
  }, [search.runId, taskRuns]);

  const selectedRunId = selectedRun?._id ?? null;
  const headerTaskRunId = selectedRunId ?? taskRuns?.[0]?._id ?? null;

  const rawWorkspaceUrl = selectedRun?.vscode?.workspaceUrl ?? null;
  const workspaceUrl = rawWorkspaceUrl ? toProxyWorkspaceUrl(rawWorkspaceUrl) : null;
  const workspacePersistKey = selectedRunId
    ? getTaskRunPersistKey(selectedRunId)
    : null;

  useEffect(() => {
    if (selectedRunId && workspaceUrl) {
      void preloadTaskRunIframes([
        {
          url: workspaceUrl,
          taskRunId: selectedRunId,
        },
      ]);
    }
  }, [selectedRunId, workspaceUrl]);

  const [editorStatus, setEditorStatus] =
    useState<PersistentIframeStatus>("loading");
  useEffect(() => {
    setEditorStatus("loading");
  }, [workspaceUrl, workspacePersistKey]);

  const onEditorLoad = useCallback(() => {
    if (selectedRunId) {
      console.log(`Workspace view loaded for task run ${selectedRunId}`);
    }
  }, [selectedRunId]);

  const onEditorError = useCallback((error: Error) => {
    if (selectedRunId) {
      console.error(`Failed to load workspace view for task run ${selectedRunId}:`, error);
    }
  }, [selectedRunId]);

  const editorLoadingFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="vscode" status="loading" />,
    [],
  );
  const editorErrorFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="vscode" status="error" />,
    [],
  );

  const rawBrowserUrl = selectedRun?.vscode?.url ?? selectedRun?.vscode?.workspaceUrl ?? null;
  const browserUrl = useMemo(() => {
    if (!rawBrowserUrl) {
      return null;
    }
    return toMorphVncUrl(rawBrowserUrl);
  }, [rawBrowserUrl]);
  const browserPersistKey = selectedRunId
    ? getTaskRunBrowserPersistKey(selectedRunId)
    : null;
  const hasBrowserView = Boolean(browserUrl);
  const isMorphProvider = selectedRun?.vscode?.provider === "morph";

  const [browserStatus, setBrowserStatus] =
    useState<PersistentIframeStatus>("loading");
  useEffect(() => {
    setBrowserStatus("loading");
  }, [browserUrl, browserPersistKey]);

  const browserOverlayMessage = useMemo(() => {
    if (!selectedRun) {
      return runsWithDepth.length
        ? "Select a run to open the browser preview."
        : "Run the task to expose a browser preview.";
    }
    if (!isMorphProvider) {
      return "Browser preview is only available for Morph workspaces.";
    }
    if (!hasBrowserView) {
      return "Waiting for the workspace to expose a browser session…";
    }
    return "Launching browser…";
  }, [selectedRun, runsWithDepth.length, isMorphProvider, hasBrowserView]);

  const isEditorBusy = Boolean(selectedRun) && (!workspaceUrl || editorStatus !== "loaded");
  const isBrowserBusy = Boolean(selectedRun) && (!hasBrowserView || browserStatus !== "loaded");

  const handleRunSelect = useCallback(
    (runId: Id<"taskRuns"> | null) => {
      if (runId === selectedRunId) {
        return;
      }
      void router.navigate({
        to: "/$teamSlugOrId/task/$taskId",
        params: { teamSlugOrId, taskId },
        search: {
          runId: runId ?? undefined,
        },
      });
    },
    [router, selectedRunId, taskId, teamSlugOrId],
  );

  const workspacePlaceholderMessage = useMemo(() => {
    if (!runsWithDepth.length) {
      return "Run the task to launch a workspace.";
    }
    if (!selectedRun) {
      return "Select a run to open the workspace.";
    }
    return "Workspace is starting…";
  }, [runsWithDepth.length, selectedRun]);

  return (
    <FloatingPane>
      <div className="flex h-full min-h-0 flex-col bg-neutral-50 dark:bg-black">
        <TaskDetailHeader
          task={task ?? null}
          taskRuns={taskRuns ?? null}
          selectedRun={selectedRun ?? null}
          taskRunId={headerTaskRunId ?? ("" as Id<"taskRuns">)}
          teamSlugOrId={teamSlugOrId}
        />
        <div className="flex flex-1 min-h-0 flex-col gap-3 px-3 py-3">
          {runsWithDepth.length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                Runs
              </span>
              <div className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {runsWithDepth.map((run, index) => {
                  const isSelected = run._id === selectedRunId;
                  const agentName = run.agentName?.trim();
                  const runLabel = agentName && agentName.length > 0 ? agentName : `Run ${index + 1}`;
                  return (
                    <button
                      key={run._id}
                      type="button"
                      onClick={() => handleRunSelect(run._id)}
                      className={clsx(
                        "inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors whitespace-nowrap",
                        isSelected
                          ? "border-neutral-900 bg-neutral-900 text-white shadow-sm dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                          : "border-neutral-200 text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:border-neutral-800 dark:text-neutral-300 dark:hover:border-neutral-600",
                      )}
                    >
                      <span className="font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
                        #{index + 1}
                      </span>
                      {run.depth > 0 ? (
                        <span className="text-neutral-300 dark:text-neutral-600">
                          {"·".repeat(run.depth)}
                        </span>
                      ) : null}
                      <span className="truncate max-w-[140px] text-left">
                        {runLabel}
                      </span>
                      {run.isCrowned ? (
                        <Crown className="size-3 text-amber-400" aria-label="Crowned run" />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="text-xs text-neutral-500 dark:text-neutral-500">
              No runs yet — start the task to launch a workspace.
            </div>
          )}

          <div className="grid flex-1 min-h-0 gap-3 md:grid-cols-2 md:grid-rows-2">
            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <TaskRunChatPane
                task={task}
                taskRuns={taskRuns}
                crownEvaluation={crownEvaluation}
              />
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <div className="flex size-6 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <Code2 className="size-3.5" aria-hidden />
                </div>
                <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  Workspace
                </h2>
              </div>
              <div className="relative flex-1" aria-busy={isEditorBusy}>
                {workspaceUrl && workspacePersistKey ? (
                  <PersistentWebView
                    persistKey={workspacePersistKey}
                    src={workspaceUrl}
                    className="flex h-full"
                    iframeClassName="select-none"
                    allow={TASK_RUN_IFRAME_ALLOW}
                    sandbox={TASK_RUN_IFRAME_SANDBOX}
                    retainOnUnmount
                    suspended={!selectedRun}
                    onLoad={onEditorLoad}
                    onError={onEditorError}
                    fallback={editorLoadingFallback}
                    fallbackClassName="bg-neutral-50 dark:bg-black"
                    errorFallback={editorErrorFallback}
                    errorFallbackClassName="bg-neutral-50/95 dark:bg-black/95"
                    onStatusChange={setEditorStatus}
                    loadTimeoutMs={60_000}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {workspacePlaceholderMessage}
                  </div>
                )}
                {selectedRun && !workspaceUrl ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <WorkspaceLoadingIndicator variant="vscode" status="loading" />
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <div className="flex size-6 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <TerminalSquare className="size-3.5" aria-hidden />
                </div>
                <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  tmux Terminal
                </h2>
              </div>
              <div className="flex-1 bg-black">
                <TaskRunTerminalPane workspaceUrl={rawWorkspaceUrl} />
              </div>
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
                <div className="flex size-6 items-center justify-center rounded-full bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
                  <Globe2 className="size-3.5" aria-hidden />
                </div>
                <h2 className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
                  Browser Preview
                </h2>
              </div>
              <div className="relative flex-1" aria-busy={isBrowserBusy}>
                {browserUrl && browserPersistKey ? (
                  <PersistentWebView
                    persistKey={browserPersistKey}
                    src={browserUrl}
                    className="flex h-full"
                    iframeClassName="select-none"
                    allow={TASK_RUN_IFRAME_ALLOW}
                    sandbox={TASK_RUN_IFRAME_SANDBOX}
                    retainOnUnmount
                    onStatusChange={setBrowserStatus}
                    fallback={
                      <WorkspaceLoadingIndicator
                        variant="browser"
                        status="loading"
                      />
                    }
                    fallbackClassName="bg-neutral-50 dark:bg-black"
                    errorFallback={
                      <WorkspaceLoadingIndicator variant="browser" status="error" />
                    }
                    errorFallbackClassName="bg-neutral-50/95 dark:bg-black/95"
                    loadTimeoutMs={45_000}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {browserOverlayMessage}
                  </div>
                )}
                {selectedRun && isMorphProvider ? (
                  <div
                    className={clsx(
                      "pointer-events-none absolute inset-0 flex items-center justify-center transition-opacity",
                      {
                        "opacity-100": isBrowserBusy,
                        "opacity-0": !isBrowserBusy,
                      },
                    )}
                  >
                    <WorkspaceLoadingIndicator variant="browser" status="loading" />
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </div>
    </FloatingPane>
  );
}
