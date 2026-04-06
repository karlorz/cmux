import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  LocalRun,
  LocalRunDetail,
  LocalRunsListResponse,
} from "@cmux/www-openapi-client";
import {
  Monitor,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Send,
  Square,
  Loader2,
  FileText,
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { RuntimeLifecycleCard } from "@/components/dashboard/RuntimeLifecycleCard";
import { RunInspectorPanel } from "@/components/dashboard/RunInspectorPanel";
import { StatusStrip } from "@/components/dashboard/StatusStrip";
import { LineageChainCard } from "@/components/dashboard/LineageChainCard";
import { RunApprovalLane } from "@/components/dashboard/RunApprovalLane";
import { ActivityStream } from "@/components/ActivityStream";
import { WebLogsPage } from "@/components/log-viewer/WebLogsPage";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import {
  buildLocalArtifactDisplay,
} from "./localRunArtifacts";
import {
  deriveLocalRunControlState,
  formatLocalRunTimestamp,
  RUN_CONTROL_ACTION_LABELS,
  RUN_CONTROL_DEFAULT_INSTRUCTIONS,
  type LocalRunArtifactDisplay,
  type RunControlSummary,
} from "@cmux/shared";

interface LocalRunActionError {
  error?: string;
  details?: string;
}

interface RunControlActionResponse {
  action: RunControlSummary["actions"]["availableActions"][number] | "continue" | "resume" | "append_instruction";
  summary: RunControlSummary;
}

const STATUS_CONFIG = {
  running: {
    icon: Play,
    label: "Running",
    className: "text-blue-600 bg-blue-100 dark:text-blue-400 dark:bg-blue-900/30",
  },
  completed: {
    icon: CheckCircle2,
    label: "Completed",
    className: "text-green-600 bg-green-100 dark:text-green-400 dark:bg-green-900/30",
  },
  failed: {
    icon: XCircle,
    label: "Failed",
    className: "text-red-600 bg-red-100 dark:text-red-400 dark:bg-red-900/30",
  },
  unknown: {
    icon: Clock,
    label: "Unknown",
    className: "text-neutral-600 bg-neutral-100 dark:text-neutral-400 dark:bg-neutral-800",
  },
} as const;

function formatDuration(durationMs?: number) {
  if (!durationMs || durationMs <= 0) {
    return null;
  }

  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}m ${seconds}s`;
}

async function parseActionError(response: Response) {
  const fallback = `Request failed: ${response.status}`;
  try {
    const error = (await response.json()) as LocalRunActionError;
    return error.details || error.error || fallback;
  } catch {
    return fallback;
  }
}

async function fetchLocalRunDetail(teamSlugOrId: string, orchestrationId: string) {
  const response = await fetch(
    `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(orchestrationId)}?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}&logs=true&events=true`,
    { credentials: "include" }
  );

  if (!response.ok) {
    throw new Error(await parseActionError(response));
  }

  return response.json() as Promise<LocalRunDetail>;
}

type RunControlFollowUpTarget = {
  path: "continue" | "resume" | "append-instruction";
  label: string;
  defaultInstruction?: string;
};

function getDefaultRunControlInstruction(
  target: RunControlFollowUpTarget | null,
  instruction: string,
) {
  return instruction || target?.defaultInstruction || "";
}

function getRunControlFollowUpTarget(
  summary: RunControlSummary | undefined,
): RunControlFollowUpTarget | null {
  const available = summary?.actions.availableActions ?? [];
  if (available.includes("continue_session")) {
    return {
      path: "continue",
      label: RUN_CONTROL_ACTION_LABELS.continue_session,
      defaultInstruction: RUN_CONTROL_DEFAULT_INSTRUCTIONS.continue_session,
    };
  }
  if (available.includes("resume_checkpoint")) {
    return {
      path: "resume",
      label: RUN_CONTROL_ACTION_LABELS.resume_checkpoint,
      defaultInstruction: RUN_CONTROL_DEFAULT_INSTRUCTIONS.resume_checkpoint,
    };
  }
  if (available.includes("append_instruction")) {
    return {
      path: "append-instruction",
      label: RUN_CONTROL_ACTION_LABELS.append_instruction,
      defaultInstruction: undefined,
    };
  }
  return null;
}

function getLocalArtifactFollowUpTarget(
  detail: LocalRunDetail | undefined,
): RunControlFollowUpTarget | null {
  if (!detail) {
    return null;
  }

  const localState = deriveLocalRunControlState({
    status: detail.status,
    sessionId: detail.sessionId,
    threadId: detail.threadId,
    checkpointRef: detail.checkpointRef,
  });

  if (localState.canResumeCheckpoint) {
    return {
      path: "resume",
      label: RUN_CONTROL_ACTION_LABELS.resume_checkpoint,
      defaultInstruction: RUN_CONTROL_DEFAULT_INSTRUCTIONS.resume_checkpoint,
    };
  }
  if (localState.canContinueSession) {
    return {
      path: "continue",
      label: RUN_CONTROL_ACTION_LABELS.continue_session,
      defaultInstruction: RUN_CONTROL_DEFAULT_INSTRUCTIONS.continue_session,
    };
  }
  if (localState.canAppendInstruction) {
    return {
      path: "append-instruction",
      label: RUN_CONTROL_ACTION_LABELS.append_instruction,
      defaultInstruction: undefined,
    };
  }
  return null;
}

async function postRunControlFollowUp(input: {
  runId: string;
  teamSlugOrId: string;
  instruction: string;
  targetPath: "continue" | "resume" | "append-instruction";
}) {
  const response = await fetch(
    `${WWW_ORIGIN}/api/run-control/${input.targetPath}/${encodeURIComponent(input.runId)}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamSlugOrId: input.teamSlugOrId,
        ...(input.instruction.trim() ? { instruction: input.instruction.trim() } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseActionError(response));
  }

  return response.json() as Promise<RunControlActionResponse>;
}

async function createLocalCheckpoint(input: {
  runId: string;
  teamSlugOrId: string;
  label?: string;
}) {
  const response = await fetch(
    `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(input.runId)}/checkpoint`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teamSlugOrId: input.teamSlugOrId,
        ...(input.label?.trim() ? { label: input.label.trim() } : {}),
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await parseActionError(response));
  }

  return response.json() as Promise<{
    checkpointRef: string;
    checkpointGeneration: number;
    label?: string;
  }>;
}

function getActionLabelForResponse(result: {
  action?: string;
  controlLane?: string;
  mode?: string;
}) {
  const actionKey =
    result.controlLane ??
    (result.action === "continue"
      ? "continue_session"
      : result.action === "resume"
        ? "resume_checkpoint"
        : result.action);

  return (
    (actionKey ? RUN_CONTROL_ACTION_LABELS[actionKey as keyof typeof RUN_CONTROL_ACTION_LABELS] : undefined) ??
    ("mode" in result && result.mode ? `Instruction sent via ${result.mode} mode` : "Instruction sent")
  );
}

function LocalRunRow({
  run,
  teamSlugOrId,
}: {
  run: LocalRun;
  teamSlugOrId: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [logTab, setLogTab] = useState<"stdout" | "stderr">("stdout");
  const lastRunIdRef = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();
  const statusConfig = STATUS_CONFIG[run.status];
  const StatusIcon = statusConfig.icon;
  const startedAtLabel = formatLocalRunTimestamp(run.startedAt);
  const canInject = run.status === "running";
  const canStop = run.status === "running";
  const canCheckpoint = run.status === "running";

  const detailQuery = useQuery<LocalRunDetail>({
    queryKey: ["local-run-detail", teamSlugOrId, run.orchestrationId],
    queryFn: () => fetchLocalRunDetail(teamSlugOrId, run.orchestrationId),
    enabled: expanded,
    staleTime: 5000,
  });

  const runControlSummaryQuery = useQuery<RunControlSummary | null>({
    queryKey: ["local-run-control-summary", teamSlugOrId, run.orchestrationId],
    queryFn: async () => {
      const response = await fetch(
        `${WWW_ORIGIN}/api/v1/cmux/orchestration/run-control/${encodeURIComponent(run.orchestrationId)}?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}`,
        { credentials: "include" },
      );
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        throw new Error(await parseActionError(response));
      }
      return response.json() as Promise<RunControlSummary>;
    },
    enabled: expanded,
    staleTime: 5000,
  });

  const sharedRunControlTarget = getRunControlFollowUpTarget(runControlSummaryQuery.data ?? undefined);
  const localArtifactTarget = getLocalArtifactFollowUpTarget(detailQuery.data);
  const runControlTarget = sharedRunControlTarget ?? localArtifactTarget;

  const injectMutation = useMutation({
    mutationFn: async () => {
      if (sharedRunControlTarget) {
        return postRunControlFollowUp({
          runId: run.orchestrationId,
          teamSlugOrId,
          instruction: getDefaultRunControlInstruction(sharedRunControlTarget, instruction),
          targetPath: sharedRunControlTarget.path,
        });
      }

      if (localArtifactTarget?.path === "resume") {
        const response = await fetch(
          `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(run.orchestrationId)}/resume`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamSlugOrId,
              message: getDefaultRunControlInstruction(localArtifactTarget, instruction),
            }),
          }
        );

        if (!response.ok) {
          throw new Error(await parseActionError(response));
        }

        return response.json() as Promise<{ mode?: string; action?: string; controlLane?: string }>;
      }

      const response = await fetch(
        `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(run.orchestrationId)}/inject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamSlugOrId,
            message: getDefaultRunControlInstruction(runControlTarget, instruction),
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await parseActionError(response));
      }

      return response.json() as Promise<{ mode?: string; action?: string; controlLane?: string }>;
    },
    onSuccess: (result) => {
      const actionLabel = getActionLabelForResponse(result);
      toast.success(
        actionLabel.startsWith("Instruction sent") ? actionLabel : `${actionLabel} queued`,
      );
      setInstruction("");
      void queryClient.invalidateQueries({ queryKey: ["local-runs", teamSlugOrId] });
      void queryClient.invalidateQueries({
        queryKey: ["local-run-detail", teamSlugOrId, run.orchestrationId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["local-run-control-summary", teamSlugOrId, run.orchestrationId],
      });
    },
    onError: (error) => {
      toast.error(`Failed to send instruction: ${error.message}`);
    },
  });

  const checkpointMutation = useMutation({
    mutationFn: async () =>
      createLocalCheckpoint({
        runId: run.orchestrationId,
        teamSlugOrId,
      }),
    onSuccess: (result) => {
      toast.success(`Checkpoint created: ${result.checkpointRef}`);
      void queryClient.invalidateQueries({ queryKey: ["local-runs", teamSlugOrId] });
      void queryClient.invalidateQueries({
        queryKey: ["local-run-detail", teamSlugOrId, run.orchestrationId],
      });
    },
    onError: (error) => {
      toast.error(`Failed to create checkpoint: ${error.message}`);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(
        `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(run.orchestrationId)}/stop`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamSlugOrId,
            force: false,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await parseActionError(response));
      }

      return response.json() as Promise<{ signal: string }>;
    },
    onSuccess: (result) => {
      toast.success(`Stop requested with ${result.signal}`);
      void queryClient.invalidateQueries({ queryKey: ["local-runs", teamSlugOrId] });
      void queryClient.invalidateQueries({
        queryKey: ["local-run-detail", teamSlugOrId, run.orchestrationId],
      });
    },
    onError: (error) => {
      toast.error(`Failed to stop local run: ${error.message}`);
    },
  });

  const detail = detailQuery.data;
  const shouldRenderInspectorPanel = Boolean(
    detail?.bridgedTaskRunId || detail?.sessionId || detail?.threadId || detail?.checkpointRef,
  );
  const artifactDisplay = useMemo(
    () => (detail ? buildLocalArtifactDisplay(detail) : null),
    [detail],
  );
  const localEventEntries = artifactDisplay?.events ?? null;
  const provider = run.agent.split("/")[0];
  const effectiveInstruction = getDefaultRunControlInstruction(runControlTarget, instruction);
  const hasEffectiveInstruction = effectiveInstruction.trim().length > 0;

  useEffect(() => {
    if (!detail) {
      return;
    }

    const preferredTab = artifactDisplay?.snapshots.preferredTab ?? "stdout";
    const availableTabs = artifactDisplay?.snapshots.availableTabs ?? ["stdout", "stderr"];
    const isNewRun = lastRunIdRef.current !== detail.orchestrationId;
    const isCurrentTabAvailable = availableTabs.includes(logTab);

    if (isNewRun) {
      lastRunIdRef.current = detail.orchestrationId;
      setLogTab(preferredTab);
      return;
    }

    if (!isCurrentTabAvailable && logTab !== preferredTab) {
      setLogTab(preferredTab);
    }
  }, [artifactDisplay?.snapshots.availableTabs, artifactDisplay?.snapshots.preferredTab, detail, logTab]);

  return (
    <div className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
      <div className="flex items-start gap-4 px-4 py-3">
        <div className="flex items-center gap-2 pt-0.5">
          <Monitor className="size-4 text-neutral-400" />
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.className}`}
          >
            <StatusIcon className="size-3" />
            {statusConfig.label}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              className="truncate font-mono text-xs font-medium text-neutral-900 dark:text-neutral-100"
              title={run.orchestrationId}
            >
              {run.orchestrationId}
            </span>
            <span className="text-xs text-neutral-500">{run.agent}</span>
          </div>
          {run.workspace && (
            <p
              className="truncate font-mono text-xs text-neutral-500 dark:text-neutral-400"
              title={run.workspace}
            >
              {run.workspace}
            </p>
          )}
          {run.prompt && (
            <p className="truncate text-xs text-neutral-500 dark:text-neutral-400" title={run.prompt}>
              {run.prompt}
            </p>
          )}
          {run.runDir && (
            <p
              className="truncate font-mono text-[11px] text-neutral-400 dark:text-neutral-500"
              title={run.runDir}
            >
              {run.runDir}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {startedAtLabel && <span className="text-xs text-neutral-400">{startedAtLabel}</span>}
          <div className="flex items-center gap-1">
            {canInject && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                title="Send follow-up instruction"
              >
                <Send className="size-3.5" />
              </button>
            )}
            {canCheckpoint && (
              <button
                type="button"
                onClick={() => checkpointMutation.mutate()}
                disabled={checkpointMutation.isPending}
                className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 disabled:opacity-50 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
                title="Create checkpoint"
              >
                {checkpointMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
              </button>
            )}
            {canStop && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Stop local run ${run.orchestrationId}?`)) {
                    stopMutation.mutate();
                  }
                }}
                disabled={stopMutation.isPending}
                className="rounded p-1 text-neutral-400 hover:bg-red-100 hover:text-red-600 disabled:opacity-50 dark:hover:bg-red-900/30 dark:hover:text-red-400"
                title="Stop local run"
              >
                {stopMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Square className="size-3.5" />
                )}
              </button>
            )}
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              className={clsx(
                "rounded p-1 transition-colors",
                expanded
                  ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                  : "text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
              )}
              title={expanded ? "Hide details" : "Show details"}
            >
              {expanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-neutral-100 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900/40">
          {detailQuery.isLoading ? (
            <div className="flex items-center gap-2 text-sm text-neutral-500">
              <Loader2 className="size-4 animate-spin" />
              Loading local run details...
            </div>
          ) : detailQuery.error ? (
            <div className="text-sm text-red-600 dark:text-red-400">
              {detailQuery.error.message}
            </div>
          ) : detail ? (
            <div className="space-y-4">
              {run.orchestrationId ? (
                <div className="space-y-2">
                  <StatusStrip
                    runId={run.orchestrationId}
                    teamSlugOrId={teamSlugOrId}
                    branch={undefined}
                    contextTaskRunId={detail?.bridgedTaskRunId as never}
                  />
                  <RuntimeLifecycleCard
                    runId={run.orchestrationId}
                    teamSlugOrId={teamSlugOrId}
                  />
                  {shouldRenderInspectorPanel ? (
                    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                      <RunInspectorPanel
                        runId={run.orchestrationId}
                        teamSlugOrId={teamSlugOrId}
                        taskRunContextId={detail.bridgedTaskRunId as never}
                      />
                    </div>
                  ) : null}
                  {detail?.bridgedTaskRunId ? (
                    <>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <ActivityStream runId={detail.bridgedTaskRunId} provider={provider} />
                      </div>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <WebLogsPage
                          taskRunId={detail.bridgedTaskRunId as never}
                          teamId={teamSlugOrId}
                        />
                      </div>
                      <LineageChainCard
                        taskRunId={detail.bridgedTaskRunId as never}
                        teamSlugOrId={teamSlugOrId}
                      />
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <RunApprovalLane
                          taskRunId={detail.bridgedTaskRunId as never}
                          teamSlugOrId={teamSlugOrId}
                        />
                      </div>
                      {detail.bridgedTaskId ? (
                        <div className="flex flex-wrap justify-end gap-2">
                          <Link
                            to="/$teamSlugOrId/task/$taskId/run/$runId"
                            params={{
                              teamSlugOrId,
                              taskId: detail.bridgedTaskId as never,
                              runId: detail.bridgedTaskRunId as never,
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-blue-400 dark:hover:bg-neutral-800"
                          >
                            Open shared run page
                          </Link>
                          <Link
                            to="/$teamSlugOrId/task/$taskId/run/$runId/activity"
                            params={{
                              teamSlugOrId,
                              taskId: detail.bridgedTaskId as never,
                              runId: detail.bridgedTaskRunId as never,
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-blue-400 dark:hover:bg-neutral-800"
                          >
                            Open shared activity page
                          </Link>
                          <Link
                            to="/$teamSlugOrId/task/$taskId/run/$runId/logs"
                            params={{
                              teamSlugOrId,
                              taskId: detail.bridgedTaskId as never,
                              runId: detail.bridgedTaskRunId as never,
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-blue-600 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-blue-400 dark:hover:bg-neutral-800"
                          >
                            Open shared logs page
                          </Link>
                        </div>
                      ) : null}
                    </>
                  ) : localEventEntries && localEventEntries.feedEntries.length > 0 ? (
                    <>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <ActivityStream entries={localEventEntries.feedEntries} provider={provider} />
                      </div>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <WebLogsPage entries={localEventEntries.feedEntries} />
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}

              <LocalArtifactsPanel
                detail={detail}
                artifactDisplay={artifactDisplay}
                logTab={logTab}
                onLogTabChange={setLogTab}
              />

              <div>
                <label
                  htmlFor={`instruction-${run.orchestrationId}`}
                  className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
                >
                  {runControlTarget ? runControlTarget.label : "Follow-up instruction"}
                </label>
                <textarea
                  id={`instruction-${run.orchestrationId}`}
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
                  placeholder={
                    runControlTarget?.defaultInstruction
                      ? `${runControlTarget.defaultInstruction} (optional override)`
                      : "Tell the local run what to do next..."
                  }
                  disabled={!canInject}
                />
                <div className="mt-2 flex items-center justify-between gap-3">
                  <div className="text-xs text-neutral-500 dark:text-neutral-400">
                    {runControlTarget?.defaultInstruction ? "Uses the default instruction when left blank." : "Provide an instruction to continue this run."}
                  </div>
                  <button
                    type="button"
                    onClick={() => injectMutation.mutate()}
                    disabled={!canInject || !hasEffectiveInstruction || injectMutation.isPending}
                    className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {injectMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 size-4 animate-spin" />
                        {runControlTarget ? `${runControlTarget.label}...` : "Sending..."}
                      </>
                    ) : (
                      <>
                        <Send className="mr-2 size-4" />
                        {runControlTarget?.label ?? "Send instruction"}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function LocalArtifactsPanel({
  detail,
  artifactDisplay,
  logTab,
  onLogTabChange,
}: {
  detail: LocalRunDetail;
  artifactDisplay: LocalRunArtifactDisplay | null;
  logTab: "stdout" | "stderr";
  onLogTabChange: (tab: "stdout" | "stderr") => void;
}) {
  const availableLogTabs = artifactDisplay?.snapshots.availableTabs ?? ["stdout", "stderr"];

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    setShowDiagnostics(false);
  }, [detail.orchestrationId]);

  const activeLog =
    logTab === "stdout"
      ? artifactDisplay?.snapshots.stdout ?? detail.stdout
      : artifactDisplay?.snapshots.stderr ?? detail.stderr;
  const metadataSummaryItems = artifactDisplay?.summaryItems ?? [];
  const diagnosticGroups = artifactDisplay?.diagnosticGroups ?? [];
  const result = artifactDisplay?.result ?? detail.result;
  const error = artifactDisplay?.error ?? detail.error;
  const localEvents = artifactDisplay?.events.rawEvents ?? detail.events ?? [];
  const showRawEvents = artifactDisplay?.events.showRawEvents ?? !detail.bridgedTaskRunId;

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Local artifacts
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Stdout/stderr snapshots, result summaries, and diagnostic metadata come directly from local run artifacts.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Status" value={STATUS_CONFIG[detail.status].label} monospace={false} />
        <InfoCard label="Started" value={formatLocalRunTimestamp(detail.startedAt) ?? "—"} monospace={false} />
        <InfoCard label="Duration" value={formatDuration(detail.durationMs) ?? "—"} monospace={false} />
        <InfoCard label="Timeout" value={detail.timeout ?? "—"} monospace={false} />
      </div>

      {(result || error) && (
        <div className="grid gap-3 md:grid-cols-2">
          {result ? (
            <InfoCard label="Result" value={result} monospace={false} tone="success" />
          ) : null}
          {error ? (
            <InfoCard label="Error" value={error} monospace={false} tone="danger" />
          ) : null}
        </div>
      )}

      {metadataSummaryItems.length > 0 ? (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Artifact summary
          </div>
          <dl className="grid gap-3 md:grid-cols-2">
            {metadataSummaryItems.map((item) => (
              <div
                key={item.label}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950"
              >
                <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                  {item.label}
                </dt>
                <dd
                  className={clsx(
                    "mt-1 text-sm text-neutral-800 dark:text-neutral-200",
                    item.monospace === false ? undefined : "font-mono text-xs",
                  )}
                  title={item.value}
                >
                  {item.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}

      {diagnosticGroups.length > 0 ? (
        <div>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Diagnostic metadata
            </div>
            <button
              type="button"
              onClick={() => setShowDiagnostics((value) => !value)}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
            >
              {showDiagnostics ? "Hide details" : `Show details (${diagnosticGroups.reduce((count, group) => count + group.items.length, 0)})`}
            </button>
          </div>
          {showDiagnostics ? (
            <div className="space-y-3">
              {diagnosticGroups.map((section) => (
                <div key={section.key}>
                  <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
                    {section.label}
                  </div>
                  <dl className="grid gap-3 md:grid-cols-2">
                    {section.items.map((item) => (
                      <div
                        key={item.label}
                        className="rounded-lg border border-neutral-200 bg-white px-3 py-2 dark:border-neutral-800 dark:bg-neutral-950"
                      >
                        <dt className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                          {item.label}
                        </dt>
                        <dd
                          className={clsx(
                            "mt-1 text-sm text-neutral-800 dark:text-neutral-200",
                            item.monospace === false ? undefined : "font-mono text-xs",
                          )}
                          title={item.value ?? undefined}
                        >
                          {item.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-xs text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Hidden by default to keep the artifact summary focused.
            </div>
          )}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <FileText className="size-4 text-neutral-400" />
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Local stdout/stderr snapshots
          </span>
          <div className="ml-auto flex rounded-md border border-neutral-200 dark:border-neutral-700">
            {availableLogTabs.map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => onLogTabChange(tab)}
                className={clsx(
                  "px-2 py-1 text-xs font-medium capitalize",
                  logTab === tab
                    ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
                    : "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>
        <pre className="max-h-56 overflow-auto rounded-lg border border-neutral-200 bg-white p-3 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-950 dark:text-neutral-300">
          {activeLog && activeLog.trim().length > 0 ? activeLog : "(empty)"}
        </pre>
      </div>

      {showRawEvents ? (
        <div>
          <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Local raw events
          </div>
          {localEvents.length > 0 ? (
            <div className="max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
              <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
                {localEvents.map((event, index) => (
                  <div key={`${event.timestamp}-${index}`} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-neutral-400">
                        {formatLocalRunTimestamp(event.timestamp) ?? event.timestamp}
                      </span>
                      <span className="font-medium text-neutral-700 dark:text-neutral-300">
                        {event.type}
                      </span>
                    </div>
                    <div className="mt-1 text-neutral-500 dark:text-neutral-400">{event.message}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-neutral-200 px-3 py-4 text-xs text-neutral-400 dark:border-neutral-800">
              No events recorded yet.
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function InfoCard({
  label,
  value,
  monospace = false,
  tone = "default",
}: {
  label: string;
  value: string;
  monospace?: boolean;
  tone?: "default" | "success" | "danger";
}) {
  const toneClassName =
    tone === "success"
      ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
      : tone === "danger"
        ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
        : "text-neutral-800 dark:text-neutral-200";

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div
        className={clsx(
          "mt-1 text-sm",
          toneClassName,
          monospace ? "font-mono text-xs" : undefined,
        )}
      >
        {value}
      </div>
    </div>
  );
}

interface LocalRunsListProps {
  teamSlugOrId: string;
}

export function LocalRunsList({ teamSlugOrId }: LocalRunsListProps) {
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery<LocalRunsListResponse>({
    queryKey: ["local-runs", teamSlugOrId],
    queryFn: async () => {
      const response = await fetch(
        `${WWW_ORIGIN}/api/orchestrate/list-local?teamSlugOrId=${encodeURIComponent(teamSlugOrId)}&limit=10`,
        { credentials: "include" }
      );
      if (!response.ok) {
        if (response.status === 404) {
          return { runs: [], count: 0 };
        }
        throw new Error(`Failed to fetch local runs: ${response.status}`);
      }
      return response.json();
    },
    refetchInterval: 10000,
    staleTime: 5000,
  });

  const runs = data?.runs ?? [];

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-neutral-500">
        Local runs unavailable
      </div>
    );
  }

  if (runs.length === 0) {
    return (
      <div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-neutral-500">
        <Monitor className="size-8 text-neutral-300 dark:text-neutral-600" />
        No local runs yet
        <p className="text-xs">
          Use the Spawn Agent dialog with "Local" venue to start a local run
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-neutral-100 px-4 py-2 dark:border-neutral-800">
        <span className="text-xs text-neutral-500">
          {runs.length} local run{runs.length !== 1 ? "s" : ""}
        </span>
        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="flex items-center gap-1 text-xs text-neutral-500 hover:text-neutral-700 disabled:opacity-50 dark:hover:text-neutral-300"
        >
          <RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      {runs.map((run) => (
        <LocalRunRow key={run.orchestrationId} run={run} teamSlugOrId={teamSlugOrId} />
      ))}
    </div>
  );
}
