import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import type { RunControlSummary } from "@cmux/shared";

interface LocalRun {
  orchestrationId: string;
  agent: string;
  status: "running" | "completed" | "failed" | "unknown";
  prompt?: string;
  startedAt?: string;
  completedAt?: string;
  runDir?: string;
  workspace?: string;
  bridgedTaskId?: string;
  bridgedTaskRunId?: string;
}

interface LocalRunEvent {
  timestamp: string;
  type: string;
  message: string;
}

interface LocalRunDetail extends LocalRun {
  timeout?: string;
  durationMs?: number;
  result?: string;
  error?: string;
  stdout?: string;
  stderr?: string;
  events?: LocalRunEvent[];
}

interface LocalRunsResponse {
  runs: LocalRun[];
  count: number;
}

interface LocalRunActionError {
  error?: string;
  details?: string;
}

interface RunControlActionResponse {
  action: RunControlSummary["actions"]["availableActions"][number] | "continue" | "resume" | "append_instruction";
  summary: RunControlSummary;
}

const RUN_CONTROL_ACTION_LABELS: Record<string, string> = {
  continue_session: "Continue session",
  continue: "Continue session",
  resume_checkpoint: "Resume checkpoint",
  resume: "Resume checkpoint",
  append_instruction: "Append instruction",
};

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

function formatRunTimestamp(timestamp?: string) {
  if (!timestamp) {
    return null;
  }

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return timestamp;
  }

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

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
      defaultInstruction: "Continue with the current task.",
    };
  }
  if (available.includes("resume_checkpoint")) {
    return {
      path: "resume",
      label: RUN_CONTROL_ACTION_LABELS.resume_checkpoint,
      defaultInstruction: "Resume the interrupted task.",
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
  const queryClient = useQueryClient();
  const statusConfig = STATUS_CONFIG[run.status];
  const StatusIcon = statusConfig.icon;
  const startedAtLabel = formatRunTimestamp(run.startedAt);
  const canInject = run.status === "running";
  const canStop = run.status === "running";

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

  const runControlTarget = getRunControlFollowUpTarget(runControlSummaryQuery.data ?? undefined);

  const injectMutation = useMutation({
    mutationFn: async () => {
      if (runControlTarget) {
        return postRunControlFollowUp({
          runId: run.orchestrationId,
          teamSlugOrId,
          instruction: getDefaultRunControlInstruction(runControlTarget, instruction),
          targetPath: runControlTarget.path,
        });
      }

      const response = await fetch(
        `${WWW_ORIGIN}/api/orchestrate/local-runs/${encodeURIComponent(run.orchestrationId)}/inject`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamSlugOrId,
            message: instruction,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(await parseActionError(response));
      }

      return response.json() as Promise<{ mode?: string; action?: string }>;
    },
    onSuccess: (result) => {
      const actionLabel =
        RUN_CONTROL_ACTION_LABELS[result.action ?? ""] ??
        ("mode" in result && result.mode ? `Instruction sent via ${result.mode} mode` : "Instruction sent");
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
                  {detail?.bridgedTaskRunId ? (
                    <>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <RunInspectorPanel
                          runId={run.orchestrationId}
                          teamSlugOrId={teamSlugOrId}
                          taskRunContextId={detail.bridgedTaskRunId as never}
                        />
                      </div>
                      <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
                        <ActivityStream runId={detail.bridgedTaskRunId} provider={run.agent.split("/")[0]} />
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
                  ) : null}
                </div>
              ) : null}

              <LocalArtifactsPanel
                detail={detail}
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
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => injectMutation.mutate()}
                    disabled={
                      !canInject ||
                      ((!instruction.trim() && !runControlTarget?.defaultInstruction) ||
                        injectMutation.isPending)
                    }
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
  logTab,
  onLogTabChange,
}: {
  detail: LocalRunDetail;
  logTab: "stdout" | "stderr";
  onLogTabChange: (tab: "stdout" | "stderr") => void;
}) {
  const activeLog = logTab === "stdout" ? detail.stdout : detail.stderr;

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-neutral-50/70 p-4 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Local artifacts
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            These sections come directly from local run artifacts and remain outside the shared runtime adapter.
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InfoCard label="Status" value={STATUS_CONFIG[detail.status].label} />
        <InfoCard label="Started" value={formatRunTimestamp(detail.startedAt) ?? "—"} />
        <InfoCard label="Duration" value={formatDuration(detail.durationMs) ?? "—"} />
        <InfoCard label="Timeout" value={detail.timeout ?? "—"} />
      </div>

      {(detail.result || detail.error) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {detail.result && (
            <OutputCard
              label="Result"
              className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300"
            >
              {detail.result}
            </OutputCard>
          )}
          {detail.error && (
            <OutputCard
              label="Error"
              className="bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
            >
              {detail.error}
            </OutputCard>
          )}
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center gap-2">
          <FileText className="size-4 text-neutral-400" />
          <span className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Local stdout/stderr snapshots
          </span>
          <div className="ml-auto flex rounded-md border border-neutral-200 dark:border-neutral-700">
            {(["stdout", "stderr"] as const).map((tab) => (
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

      <div>
        <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Local raw events
        </div>
        {detail.events && detail.events.length > 0 ? (
          <div className="max-h-48 overflow-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
            <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
              {detail.events.map((event, index) => (
                <div key={`${event.timestamp}-${index}`} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-neutral-400">
                      {formatRunTimestamp(event.timestamp) ?? event.timestamp}
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
    </div>
  );
}

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className="mt-1 text-sm text-neutral-800 dark:text-neutral-200">{value}</div>
    </div>
  );
}

function OutputCard({
  label,
  className,
  children,
}: {
  label: string;
  className: string;
  children: string;
}) {
  return (
    <div>
      <div className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </div>
      <div className={clsx("rounded-lg p-3 text-sm", className)}>{children}</div>
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
  } = useQuery<LocalRunsResponse>({
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
