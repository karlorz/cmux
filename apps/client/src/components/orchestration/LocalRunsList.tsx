import { useEffect, useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { LocalRunDetailPanel } from "./LocalRunDetailPanel";
import { buildLocalArtifactDisplay } from "./localRunArtifacts";
import {
  deriveLocalRunControlState,
  formatLocalRunTimestamp,
  RUN_CONTROL_ACTION_LABELS,
  RUN_CONTROL_DEFAULT_INSTRUCTIONS,
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
  const artifactDisplay = useMemo(
    () => (detail ? buildLocalArtifactDisplay(detail) : null),
    [detail],
  );
  const shouldRenderInspectorPanel = Boolean(
    detail?.bridgedTaskRunId || detail?.sessionId || detail?.threadId || detail?.checkpointRef,
  );
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
          ) : detail && artifactDisplay ? (
            <LocalRunDetailPanel
              run={run}
              detail={detail}
              artifactDisplay={artifactDisplay}
              teamSlugOrId={teamSlugOrId}
              provider={provider}
              shouldRenderInspectorPanel={shouldRenderInspectorPanel}
              logTab={logTab}
              onLogTabChange={setLogTab}
              followUpLabel={runControlTarget?.label ?? "Follow-up instruction"}
              followUpDefaultInstruction={runControlTarget?.defaultInstruction}
              instruction={instruction}
              onInstructionChange={setInstruction}
              canInject={canInject}
              hasEffectiveInstruction={hasEffectiveInstruction}
              injectPending={injectMutation.isPending}
              onInject={() => injectMutation.mutate()}
            />
          ) : null}
        </div>
      )}
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
