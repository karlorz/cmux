/**
 * RunInspectorPanel - Unified inspector for run identity, continuation, and memory
 *
 * Consolidates:
 * - Session binding (provider session, thread ID)
 * - Checkpoint metadata
 * - Continuation lane (continue session, resume checkpoint, append instruction)
 * - Memory and instruction provenance
 * - Writable scope
 *
 * Implements issue #959 acceptance criteria:
 * - Operator can tell which continuation lane is real
 * - Memory/instruction provenance visible without leaving main page
 * - Session and checkpoint state in one place
 */

import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import {
  RUN_CONTROL_ACTION_LABELS,
  type RunControlSummary,
} from "@cmux/shared";
import { getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions } from "@cmux/www-openapi-client/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import clsx from "clsx";
import {
  Activity,
  AlertCircle,
  Brain,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Key,
  Layers,
  Link2,
  MessageSquare,
  Play,
  RefreshCw,
  RotateCcw,
  Server,
  Terminal,
  User,
} from "lucide-react";
import { useState } from "react";

import { TaskRunMemoryPanel } from "@/components/TaskRunMemoryPanel";

interface SessionPanelData {
  hasBoundSession: boolean;
  provider: string | null;
  status: string | null;
  mode: string | null;
  replyChannel: string | null;
  providerSessionId: string | null;
  providerThreadId: string | null;
  isResumedSession: boolean;
  createdAt: number | null;
  lastActiveAt: number | null;
  source: "ancestry" | "summary";
}

function deriveSessionPanelData(
  ancestry:
    | {
        hasBoundSession: boolean;
        provider: string | null;
        status: string | null;
        mode: string | null;
        replyChannel: string | null;
        providerSessionId: string | null;
        providerThreadId: string | null;
        isResumedSession: boolean;
        createdAt: number | null;
        lastActiveAt: number | null;
      }
    | undefined,
  summary: RunControlSummary | undefined,
): SessionPanelData | undefined {
  if (ancestry?.hasBoundSession) {
    return {
      ...ancestry,
      source: "ancestry",
    };
  }

  if (!summary) {
    return undefined;
  }

  const hasDerivedSession = Boolean(
    summary.continuation.providerSessionId ||
      summary.continuation.providerThreadId ||
      summary.continuation.hasActiveBinding,
  );
  if (!hasDerivedSession) {
    return undefined;
  }

  return {
    hasBoundSession: true,
    provider: summary.provider || null,
    status:
      summary.continuation.sessionStatus ??
      (summary.continuation.hasActiveBinding ? "active" : null),
    mode:
      summary.continuation.sessionMode ??
      (summary.continuation.mode === "session_continuation"
        ? "session_continuation"
        : null),
    replyChannel: summary.continuation.replyChannel ?? null,
    providerSessionId: summary.continuation.providerSessionId ?? null,
    providerThreadId: summary.continuation.providerThreadId ?? null,
    isResumedSession: false,
    createdAt: null,
    lastActiveAt: summary.continuation.lastActiveAt ?? null,
    source: "summary",
  };
}

interface RunInspectorPanelProps {
  runId: string;
  teamSlugOrId: string;
  taskRunContextId?: Id<"taskRuns">;
}

type InspectorTab = "continuation" | "session" | "memory";

export function RunInspectorPanel({ runId, teamSlugOrId, taskRunContextId }: RunInspectorPanelProps) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("continuation");
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(["continuation-lane", "session-binding"])
  );

  // Run control data for continuation and lifecycle
  const runControlQuery = useQuery({
    ...getApiV1CmuxOrchestrationRunControlByTaskRunIdOptions({
      path: { taskRunId: runId },
      query: { teamSlugOrId },
    }),
    enabled: Boolean(teamSlugOrId && runId),
  });

  // Session ancestry data
  const ancestryQuery = useQuery({
    ...convexQuery(api.providerSessions.getResumeAncestry, {
      teamSlugOrId,
      taskRunId: taskRunContextId ?? (runId as Id<"taskRuns">),
    }),
    enabled: Boolean(teamSlugOrId && taskRunContextId),
  });

  const summary = runControlQuery.data;
  const ancestry = ancestryQuery.data;
  const sessionPanelData = deriveSessionPanelData(ancestry, summary);

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  if (runControlQuery.isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        <TabButton
          active={activeTab === "continuation"}
          onClick={() => setActiveTab("continuation")}
          icon={Play}
          label="Continuation"
        />
        <TabButton
          active={activeTab === "session"}
          onClick={() => setActiveTab("session")}
          icon={Link2}
          label="Session"
          badge={sessionPanelData?.hasBoundSession ? "bound" : undefined}
        />
        <TabButton
          active={activeTab === "memory"}
          onClick={() => setActiveTab("memory")}
          icon={Brain}
          label="Memory"
        />
      </div>

      {/* Tab content */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeTab === "continuation" && summary && (
          <ContinuationPanel
            summary={summary}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
          />
        )}

        {activeTab === "session" && (
          <SessionPanel
            session={sessionPanelData}
            expandedSections={expandedSections}
            toggleSection={toggleSection}
          />
        )}

        {activeTab === "memory" && taskRunContextId && (
          <TaskRunMemoryPanel taskRunId={taskRunContextId} teamSlugOrId={teamSlugOrId} />
        )}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: typeof Play;
  label: string;
  badge?: string;
}

function TabButton({ active, onClick, icon: Icon, label, badge }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
        active
          ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
          : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
      )}
    >
      <Icon className="size-3.5" />
      {label}
      {badge && (
        <span className="ml-1 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
          {badge}
        </span>
      )}
    </button>
  );
}

interface SectionProps {
  title: string;
  icon: typeof Play;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  badge?: { label: string; tone: "green" | "amber" | "red" | "blue" | "neutral" };
}

function Section({ title, icon: Icon, expanded, onToggle, children, badge }: SectionProps) {
  const toneClasses: Record<NonNullable<SectionProps["badge"]>["tone"], string> = {
    green: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    blue: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    neutral: "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400",
  };

  return (
    <div className="border-b border-neutral-200 dark:border-neutral-800">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
      >
        {expanded ? (
          <ChevronDown className="size-4 text-neutral-400" />
        ) : (
          <ChevronRight className="size-4 text-neutral-400" />
        )}
        <Icon className="size-4 text-neutral-600 dark:text-neutral-400" />
        <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {title}
        </span>
        {badge && (
          <span
            className={clsx(
              "ml-auto rounded-full px-2 py-0.5 text-xs font-medium",
              toneClasses[badge.tone]
            )}
          >
            {badge.label}
          </span>
        )}
      </button>
      {expanded && <div className="px-3 pb-3">{children}</div>}
    </div>
  );
}

interface ContinuationPanelProps {
  summary: RunControlSummary;
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
}

function ContinuationPanel({
  summary,
  expandedSections,
  toggleSection,
}: ContinuationPanelProps) {
  const { continuation, lifecycle, actions } = summary;

  const continuationLaneBadge = getContinuationBadge(continuation.mode);
  const lifecycleBadge = getLifecycleBadge(lifecycle.status);

  return (
    <div>
      {/* Continuation Lane - THE key question for operators */}
      <Section
        title="Continuation Lane"
        icon={Play}
        expanded={expandedSections.has("continuation-lane")}
        onToggle={() => toggleSection("continuation-lane")}
        badge={continuationLaneBadge}
      >
        <div className="space-y-3">
          {/* Primary lane indicator */}
          <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-700 dark:bg-neutral-800">
            <div className="flex items-center gap-2">
              <ContinuationIcon mode={continuation.mode} />
              <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                {getContinuationLabel(continuation.mode)}
              </span>
            </div>
            <p className="mt-1 text-xs text-neutral-600 dark:text-neutral-400">
              {getContinuationDescription(continuation.mode)}
            </p>
          </div>

          {/* Available actions */}
          {actions.availableActions.length > 0 && (
            <div>
              <span className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Available actions:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {actions.availableActions.map((action) => (
                  <span
                    key={action}
                    className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                  >
                    {formatAction(action)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Session/Thread/Checkpoint IDs */}
          <div className="space-y-2 text-xs">
            {continuation.providerSessionId && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Key className="size-3.5" />
                <span>Session:</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(continuation.providerSessionId)}
                </code>
              </div>
            )}
            {continuation.providerThreadId && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Terminal className="size-3.5" />
                <span>Thread:</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(continuation.providerThreadId)}
                </code>
              </div>
            )}
            {continuation.checkpointRef && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <RotateCcw className="size-3.5" />
                <span>Checkpoint:</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(continuation.checkpointRef)}
                </code>
                {continuation.checkpointGeneration !== undefined && (
                  <span className="text-neutral-400">
                    (gen {continuation.checkpointGeneration})
                  </span>
                )}
              </div>
            )}
            {continuation.lastActiveAt && (
              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Clock className="size-3.5" />
                <span>Last active: {formatTimestamp(continuation.lastActiveAt)}</span>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Lifecycle State */}
      <Section
        title="Lifecycle State"
        icon={Activity}
        expanded={expandedSections.has("lifecycle")}
        onToggle={() => toggleSection("lifecycle")}
        badge={lifecycleBadge}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <LifecycleIcon status={lifecycle.status} />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {formatLifecycleStatus(lifecycle.status)}
            </span>
            {lifecycle.interruptionStatus !== "none" && (
              <span className="text-xs text-amber-600 dark:text-amber-400">
                ({formatInterruptionStatus(lifecycle.interruptionStatus)})
              </span>
            )}
          </div>

          {lifecycle.reason && (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">
              {lifecycle.reason}
            </p>
          )}

          <div className="space-y-1 text-xs text-neutral-500 dark:text-neutral-400">
            <div className="flex items-center gap-2">
              <Server className="size-3.5" />
              <span>
                Run status:{" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {summary.runStatus}
                </span>
              </span>
            </div>
            {lifecycle.blockedAt && (
              <div className="flex items-center gap-2">
                <Clock className="size-3.5" />
                <span>Blocked: {formatTimestamp(lifecycle.blockedAt)}</span>
              </div>
            )}
            {lifecycle.expiresAt && !lifecycle.resolvedAt && (
              <div className="flex items-center gap-2">
                <AlertCircle className="size-3.5" />
                <span>Expires: {formatTimestamp(lifecycle.expiresAt)}</span>
              </div>
            )}
            {lifecycle.resolvedAt && (
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-3.5" />
                <span>
                  Resolved: {formatTimestamp(lifecycle.resolvedAt)}
                  {lifecycle.resolvedBy && ` by ${lifecycle.resolvedBy}`}
                </span>
              </div>
            )}
          </div>
        </div>
      </Section>

      {/* Provider/Agent Info */}
      <Section
        title="Provider & Model"
        icon={Server}
        expanded={expandedSections.has("provider")}
        onToggle={() => toggleSection("provider")}
      >
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Server className="size-3.5" />
            <span>Provider:</span>
            <span className="font-medium text-neutral-800 dark:text-neutral-200">
              {formatProvider(summary.provider)}
            </span>
          </div>
          {summary.agentName && (
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <User className="size-3.5" />
              <span>Agent:</span>
              <span className="font-medium text-neutral-800 dark:text-neutral-200">
                {summary.agentName}
              </span>
            </div>
          )}
          {summary.orchestrationId && (
            <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
              <Layers className="size-3.5" />
              <span>Orchestration:</span>
              <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                {truncateId(summary.orchestrationId)}
              </code>
            </div>
          )}
        </div>
      </Section>
    </div>
  );
}

interface SessionPanelProps {
  session: SessionPanelData | undefined;
  expandedSections: Set<string>;
  toggleSection: (section: string) => void;
}

function SessionPanel({ session, expandedSections, toggleSection }: SessionPanelProps) {
  if (!session?.hasBoundSession) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-neutral-500 dark:text-neutral-400">
        <Link2 className="size-8 text-neutral-400 dark:text-neutral-500" />
        <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
          No session binding
        </div>
        <p className="text-xs">
          Session bindings enable resume across retries and provider-native continuation
        </p>
      </div>
    );
  }

  const statusBadge = getSessionStatusBadge(session.status);

  return (
    <div>
      <Section
        title="Session Binding"
        icon={Link2}
        expanded={expandedSections.has("session-binding")}
        onToggle={() => toggleSection("session-binding")}
        badge={statusBadge}
      >
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <ProviderIcon provider={session.provider} />
            <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              {session.provider ? capitalizeFirst(session.provider) : "Unknown"} Session
            </span>
            {session.isResumedSession && (
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                <RotateCcw className="size-3" />
                Resumed
              </span>
            )}
            {session.source === "summary" && (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
                Derived from run control
              </span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 text-xs">
            {session.mode && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <User className="size-3.5" />
                <span>Mode:</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {session.mode}
                </span>
              </div>
            )}

            {session.replyChannel && (
              <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <MessageSquare className="size-3.5" />
                <span>Channel:</span>
                <span className="font-medium text-neutral-800 dark:text-neutral-200">
                  {session.replyChannel}
                </span>
              </div>
            )}

            {session.providerSessionId && (
              <div className="col-span-2 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Terminal className="size-3.5" />
                <span>Session:</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(session.providerSessionId)}
                </code>
              </div>
            )}

            {session.providerThreadId && (
              <div className="col-span-2 flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
                <Activity className="size-3.5" />
                <span>Thread:</span>
                <code className="rounded bg-neutral-100 px-1.5 py-0.5 font-mono text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
                  {truncateId(session.providerThreadId)}
                </code>
              </div>
            )}

            {session.createdAt && (
              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Clock className="size-3.5" />
                <span>Bound: {formatTimestamp(session.createdAt)}</span>
              </div>
            )}

            {session.lastActiveAt && (
              <div className="flex items-center gap-2 text-neutral-500 dark:text-neutral-400">
                <Clock className="size-3.5" />
                <span>Active: {formatTimestamp(session.lastActiveAt)}</span>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

// Helper components and functions

function ContinuationIcon({ mode }: { mode: RunControlSummary["continuation"]["mode"] }) {
  const className = "size-4";
  switch (mode) {
    case "session_continuation":
      return <Play className={clsx(className, "text-green-600 dark:text-green-400")} />;
    case "checkpoint_restore":
      return <RotateCcw className={clsx(className, "text-amber-600 dark:text-amber-400")} />;
    case "append_instruction":
      return <RefreshCw className={clsx(className, "text-blue-600 dark:text-blue-400")} />;
    default:
      return <AlertCircle className={clsx(className, "text-neutral-400")} />;
  }
}

function LifecycleIcon({ status }: { status: RunControlSummary["lifecycle"]["status"] }) {
  const className = "size-4";
  switch (status) {
    case "active":
      return <Play className={clsx(className, "text-green-600 dark:text-green-400")} />;
    case "interrupted":
      return <AlertCircle className={clsx(className, "text-amber-600 dark:text-amber-400")} />;
    case "completed":
      return <CheckCircle2 className={clsx(className, "text-green-600 dark:text-green-400")} />;
    case "failed":
      return <AlertCircle className={clsx(className, "text-red-600 dark:text-red-400")} />;
    default:
      return <RefreshCw className={clsx(className, "text-neutral-400")} />;
  }
}

function ProviderIcon({ provider }: { provider: string | null }) {
  const className = "size-4 font-bold";
  switch (provider) {
    case "claude":
      return <span className={clsx(className, "text-orange-600")}>C</span>;
    case "codex":
      return <span className={clsx(className, "text-green-600")}>X</span>;
    case "gemini":
      return <span className={clsx(className, "text-blue-600")}>G</span>;
    default:
      return <Terminal className="size-4 text-neutral-600 dark:text-neutral-400" />;
  }
}

function getContinuationBadge(
  mode: RunControlSummary["continuation"]["mode"]
): { label: string; tone: "green" | "amber" | "blue" | "neutral" } {
  switch (mode) {
    case "session_continuation":
      return { label: "Continue Session", tone: "green" };
    case "checkpoint_restore":
      return { label: "Resume Checkpoint", tone: "amber" };
    case "append_instruction":
      return { label: "Append Instruction", tone: "blue" };
    default:
      return { label: "No Path", tone: "neutral" };
  }
}

function getLifecycleBadge(
  status: RunControlSummary["lifecycle"]["status"]
): { label: string; tone: "green" | "amber" | "red" | "neutral" } {
  switch (status) {
    case "active":
      return { label: "Active", tone: "green" };
    case "interrupted":
      return { label: "Interrupted", tone: "amber" };
    case "completed":
      return { label: "Completed", tone: "green" };
    case "failed":
      return { label: "Failed", tone: "red" };
    default:
      return { label: "Skipped", tone: "neutral" };
  }
}

function getSessionStatusBadge(
  status: string | null
): { label: string; tone: "green" | "amber" | "red" | "neutral" } | undefined {
  switch (status) {
    case "active":
      return { label: "Active", tone: "green" };
    case "suspended":
      return { label: "Suspended", tone: "amber" };
    case "expired":
      return { label: "Expired", tone: "neutral" };
    case "terminated":
      return { label: "Terminated", tone: "red" };
    default:
      return undefined;
  }
}

function getContinuationLabel(mode: RunControlSummary["continuation"]["mode"]): string {
  switch (mode) {
    case "session_continuation":
      return RUN_CONTROL_ACTION_LABELS.continue_session;
    case "checkpoint_restore":
      return RUN_CONTROL_ACTION_LABELS.resume_checkpoint;
    case "append_instruction":
      return RUN_CONTROL_ACTION_LABELS.append_instruction;
    default:
      return "No Continuation Path";
  }
}

function getContinuationDescription(mode: RunControlSummary["continuation"]["mode"]): string {
  switch (mode) {
    case "session_continuation":
      return "Reconnect the existing provider session. This is provider-native continuation without checkpoint restore.";
    case "checkpoint_restore":
      return "Restore from stored checkpoint state. This recovers agent state rather than reconnecting a live session.";
    case "append_instruction":
      return "No resumable session or checkpoint. Continue by appending a new instruction to the run.";
    default:
      return "No continuation path is currently available for this run.";
  }
}

function formatAction(action: string): string {
  return action
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function formatLifecycleStatus(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatInterruptionStatus(status: string): string {
  return status
    .split("_")
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function formatProvider(provider: string): string {
  if (provider === "pve-lxc") return "PVE LXC";
  return provider
    .split(/[_-]/g)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncateId(id: string, maxLen = 24): string {
  if (id.length <= maxLen) return id;
  return `${id.slice(0, 12)}...${id.slice(-8)}`;
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
