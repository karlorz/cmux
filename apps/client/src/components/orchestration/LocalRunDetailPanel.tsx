import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { LocalRun, LocalRunDetail } from "@cmux/www-openapi-client";
import { FileText, Loader2, Send } from "lucide-react";
import clsx from "clsx";
import { RuntimeLifecycleCard } from "@/components/dashboard/RuntimeLifecycleCard";
import { RunInspectorPanel } from "@/components/dashboard/RunInspectorPanel";
import { StatusStrip } from "@/components/dashboard/StatusStrip";
import { LineageChainCard } from "@/components/dashboard/LineageChainCard";
import { RunApprovalLane } from "@/components/dashboard/RunApprovalLane";
import { ActivityStream } from "@/components/ActivityStream";
import { WebLogsPage } from "@/components/log-viewer/WebLogsPage";
import {
  formatLocalRunTimestamp,
  type LocalRunArtifactDisplay,
} from "@cmux/shared";

const STATUS_LABELS = {
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  unknown: "Unknown",
} as const;

interface LocalRunDetailPanelProps {
  run: LocalRun;
  detail: LocalRunDetail;
  artifactDisplay: LocalRunArtifactDisplay;
  teamSlugOrId: string;
  provider: string;
  shouldRenderInspectorPanel: boolean;
  logTab: "stdout" | "stderr";
  onLogTabChange: (tab: "stdout" | "stderr") => void;
  followUpLabel: string;
  followUpDefaultInstruction?: string;
  instruction: string;
  onInstructionChange: (value: string) => void;
  canInject: boolean;
  hasEffectiveInstruction: boolean;
  injectPending: boolean;
  onInject: () => void;
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

export function LocalRunDetailPanel({
  run,
  detail,
  artifactDisplay,
  teamSlugOrId,
  provider,
  shouldRenderInspectorPanel,
  logTab,
  onLogTabChange,
  followUpLabel,
  followUpDefaultInstruction,
  instruction,
  onInstructionChange,
  canInject,
  hasEffectiveInstruction,
  injectPending,
  onInject,
}: LocalRunDetailPanelProps) {
  const localEventEntries = artifactDisplay.events;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <StatusStrip
          runId={run.orchestrationId}
          teamSlugOrId={teamSlugOrId}
          branch={undefined}
          contextTaskRunId={detail.bridgedTaskRunId as never}
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
        {detail.bridgedTaskRunId ? (
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
        ) : localEventEntries.feedEntries.length > 0 ? (
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

      <LocalArtifactsPanel
        detail={detail}
        artifactDisplay={artifactDisplay}
        logTab={logTab}
        onLogTabChange={onLogTabChange}
      />

      <div>
        <label
          htmlFor={`instruction-${run.orchestrationId}`}
          className="mb-2 block text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
        >
          {followUpLabel}
        </label>
        <textarea
          id={`instruction-${run.orchestrationId}`}
          value={instruction}
          onChange={(e) => onInstructionChange(e.target.value)}
          rows={3}
          className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100"
          placeholder={
            followUpDefaultInstruction
              ? `${followUpDefaultInstruction} (optional override)`
              : "Tell the local run what to do next..."
          }
          disabled={!canInject}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {followUpDefaultInstruction
              ? "Uses the default instruction when left blank."
              : "Provide an instruction to continue this run."}
          </div>
          <button
            type="button"
            onClick={onInject}
            disabled={!canInject || !hasEffectiveInstruction || injectPending}
            className="inline-flex items-center rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
          >
            {injectPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                {followUpLabel === "Follow-up instruction" ? "Sending..." : `${followUpLabel}...`}
              </>
            ) : (
              <>
                <Send className="mr-2 size-4" />
                {followUpLabel === "Follow-up instruction" ? "Send instruction" : followUpLabel}
              </>
            )}
          </button>
        </div>
      </div>
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
  artifactDisplay: LocalRunArtifactDisplay;
  logTab: "stdout" | "stderr";
  onLogTabChange: (tab: "stdout" | "stderr") => void;
}) {
  const availableLogTabs = artifactDisplay.snapshots.availableTabs;

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    setShowDiagnostics(false);
  }, [detail.orchestrationId]);

  const activeLog =
    logTab === "stdout"
      ? artifactDisplay.snapshots.stdout
      : artifactDisplay.snapshots.stderr;
  const metadataSummaryItems = artifactDisplay.summaryItems;
  const diagnosticGroups = artifactDisplay.diagnosticGroups;
  const result = artifactDisplay.result;
  const error = artifactDisplay.error;
  const localEvents = artifactDisplay.events.rawEvents;
  const showRawEvents = artifactDisplay.events.showRawEvents;
  const stop = artifactDisplay.stop;

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
        <InfoCard label="Status" value={STATUS_LABELS[detail.status]} monospace={false} />
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

      {stop ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <InfoCard label="Stop status" value={stop.status} monospace={false} />
          <InfoCard label="Stop signal" value={stop.signal ?? "—"} monospace={false} />
          <InfoCard label="Stop pid" value={typeof stop.pid === "number" ? String(stop.pid) : "—"} />
          <InfoCard label="Stop message" value={stop.message} monospace={false} />
        </div>
      ) : null}

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
