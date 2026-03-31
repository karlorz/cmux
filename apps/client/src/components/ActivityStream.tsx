import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { isActivityTypeSupported } from "@cmux/shared/hook-registry";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  FileEdit,
  FileSearch,
  Terminal,
  GitCommit,
  AlertTriangle,
  Brain,
  Wrench,
  Search,
  X,
  Download,
  Filter,
  Play,
  Square,
  RotateCcw,
  Shield,
  ShieldCheck,
  HardDrive,
  Database,
  Bot,
  Bell,
  MessagesSquare,
  ServerCog,
  Info,
} from "lucide-react";
import { ActivityStreamSkeleton } from "@/components/dashboard/DashboardSkeletons";
import { formatDuration } from "@/lib/time";

/**
 * Activity types for dashboard timeline (canonical naming).
 * Aligned with CANONICAL_EVENT_TYPES in agent-comm-events.ts.
 */
const ACTIVITY_TYPES = [
  // Dashboard-specific events
  "tool_call",
  "file_edit",
  "file_read",
  "bash_command",
  "test_run",
  "git_commit",
  "error",
  "thinking",
  // Session lifecycle (canonical)
  "session_started",
  "session_resumed",
  "session_finished",
  // Stop lifecycle (canonical)
  "session_stop_requested",
  "session_stop_blocked",
  "session_stop_failed",
  // Context health (canonical)
  "context_warning",
  "context_compacted",
  // Memory (canonical)
  "memory_loaded",
  "memory_scope_changed",
  // Tool lifecycle (canonical)
  "tool_requested",
  "tool_completed",
  // Approval (canonical)
  "approval_required",
  "approval_resolved",
  // Interaction
  "user_prompt",
  "subagent_start",
  "subagent_stop",
  "notification",
  // Prompt/Turn (canonical)
  "prompt_submitted",
  "run_resumed",
  // MCP (canonical)
  "mcp_capabilities_negotiated",
  // Hook portability events
  "task_created",
  "plan_sync",
  "simplify_track",
  "precompact",
  "postcompact",
  "simplify_gate",
] as const;

/**
 * Normalize legacy event type names to canonical names.
 * Handles backward compatibility for events stored with old naming.
 */
function normalizeActivityType(type: string): string {
  const aliases: Record<string, string> = {
    session_start: "session_started",
    session_stop: "session_stop_requested",
    stop_requested: "session_stop_requested",
    stop_blocked: "session_stop_blocked",
    stop_failed: "session_stop_failed",
    approval_requested: "approval_required",
  };
  return aliases[type] ?? type;
}

type ActivityType = (typeof ACTIVITY_TYPES)[number];

interface ActivityLike {
  type: string;
  summary: string;
  detail?: string;
  toolName?: string;
  durationMs?: number;
  severity?: string;
  warningType?: string;
  usagePercent?: number;
  previousBytes?: number;
  newBytes?: number;
  reductionPercent?: number;
  stopSource?: string;
  exitCode?: number;
  continuationPrompt?: string;
  approvalId?: string;
  resolution?: string;
  resolvedBy?: string;
  scopeType?: string;
  scopeBytes?: number;
  scopeAction?: string;
  promptSource?: string;
  turnNumber?: number;
  promptLength?: number;
  turnCount?: number;
  providerSessionId?: string;
  resumeReason?: string;
  previousSessionId?: string;
  checkpointRef?: string;
  serverName?: string;
  protocolVersion?: string;
  transport?: string;
  mcpCapabilities?: string;
  toolCount?: number;
  resourceCount?: number;
}

interface ActivityConfig {
  icon: LucideIcon;
  colorClass: string;
  badgeClass: string;
  label: string;
}

const ACTIVITY_CONFIG: Record<ActivityType, ActivityConfig> = {
  tool_call: {
    icon: Wrench,
    colorClass: "text-neutral-500 dark:text-neutral-400",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: "Tool Call",
  },
  file_edit: {
    icon: FileEdit,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "File Edit",
  },
  file_read: {
    icon: FileSearch,
    colorClass: "text-neutral-500 dark:text-neutral-400",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: "File Read",
  },
  bash_command: {
    icon: Terminal,
    colorClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    label: "Command",
  },
  test_run: {
    icon: Terminal,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Test Run",
  },
  git_commit: {
    icon: GitCommit,
    colorClass: "text-purple-500 dark:text-purple-400",
    badgeClass:
      "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-900/50 dark:text-fuchsia-200",
    label: "Git Commit",
  },
  error: {
    icon: AlertTriangle,
    colorClass: "text-red-500 dark:text-red-400",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200",
    label: "Error",
  },
  thinking: {
    icon: Brain,
    colorClass: "text-neutral-400 dark:text-neutral-500",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: "Thinking",
  },
  session_started: {
    icon: Play,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Session Started",
  },
  session_resumed: {
    icon: RotateCcw,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Session Resumed",
  },
  session_finished: {
    icon: Square,
    colorClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    label: "Session Finished",
  },
  session_stop_requested: {
    icon: Square,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Stop Requested",
  },
  session_stop_blocked: {
    icon: AlertTriangle,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Stop Blocked",
  },
  session_stop_failed: {
    icon: AlertTriangle,
    colorClass: "text-red-500 dark:text-red-400",
    badgeClass: "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-200",
    label: "Stop Failed",
  },
  context_warning: {
    icon: AlertTriangle,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Context Warning",
  },
  context_compacted: {
    icon: RotateCcw,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Context Compacted",
  },
  memory_loaded: {
    icon: HardDrive,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Memory Loaded",
  },
  memory_scope_changed: {
    icon: Database,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Memory Scope",
  },
  tool_requested: {
    icon: Wrench,
    colorClass: "text-neutral-500 dark:text-neutral-400",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: "Tool Requested",
  },
  tool_completed: {
    icon: Wrench,
    colorClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    label: "Tool Completed",
  },
  approval_required: {
    icon: Shield,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Approval Required",
  },
  approval_resolved: {
    icon: ShieldCheck,
    colorClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    label: "Approval Resolved",
  },
  user_prompt: {
    icon: MessagesSquare,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "User Prompt",
  },
  subagent_start: {
    icon: Bot,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Subagent Start",
  },
  subagent_stop: {
    icon: Bot,
    colorClass: "text-neutral-500 dark:text-neutral-400",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: "Subagent Stop",
  },
  notification: {
    icon: Bell,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Notification",
  },
  prompt_submitted: {
    icon: MessagesSquare,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Prompt Submitted",
  },
  run_resumed: {
    icon: RotateCcw,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Run Resumed",
  },
  mcp_capabilities_negotiated: {
    icon: ServerCog,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "MCP Capabilities",
  },
  // Hook portability events
  task_created: {
    icon: Play,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Task Created",
  },
  plan_sync: {
    icon: RotateCcw,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Plan Sync",
  },
  simplify_track: {
    icon: Search,
    colorClass: "text-blue-500 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    label: "Simplify Track",
  },
  precompact: {
    icon: Database,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Pre-Compact",
  },
  postcompact: {
    icon: Database,
    colorClass: "text-green-600 dark:text-green-400",
    badgeClass:
      "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    label: "Post-Compact",
  },
  simplify_gate: {
    icon: Shield,
    colorClass: "text-amber-500 dark:text-amber-400",
    badgeClass:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-200",
    label: "Simplify Gate",
  },
};

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  if (diff < 1000) return "just now";
  if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatActivityDuration(durationMs: number): string {
  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60_000) return `${Math.round(durationMs / 1000)}s`;
  return formatDuration(durationMs);
}

function formatActivityValue(value: string): string {
  return value.replaceAll("_", " ");
}

function formatActivityTypeLabel(type: string): string {
  return type
    .split("_")
    .map((segment) => {
      if (!segment) return segment;
      return segment[0].toUpperCase() + segment.slice(1);
    })
    .join(" ");
}

function isKnownActivityType(type: string): type is ActivityType {
  const normalized = normalizeActivityType(type);
  return ACTIVITY_TYPES.some((activityType) => activityType === normalized);
}

function getActivityConfig(type: string): ActivityConfig {
  const normalized = normalizeActivityType(type);
  if (ACTIVITY_TYPES.some((t) => t === normalized)) {
    return ACTIVITY_CONFIG[normalized as ActivityType];
  }

  return {
    icon: Wrench,
    colorClass: "text-neutral-500 dark:text-neutral-400",
    badgeClass:
      "bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300",
    label: formatActivityTypeLabel(type),
  };
}

function getEnabledMcpCapabilities(serialized?: string): string[] {
  if (!serialized) return [];

  try {
    const parsed: unknown = JSON.parse(serialized);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return [];
    }

    return Object.entries(parsed)
      .filter(([, enabled]) => enabled === true)
      .map(([capability]) => capability);
  } catch {
    return [];
  }
}

function getActivityMetadata(activity: ActivityLike): string[] {
  const metadata: string[] = [];

  if (activity.toolName) {
    metadata.push(activity.toolName);
  }

  const normalizedType = normalizeActivityType(activity.type);
  switch (normalizedType) {
    case "session_started":
    case "session_stop_requested":
    case "session_resumed":
      if (activity.providerSessionId) {
        metadata.push(`Session: ${activity.providerSessionId}`);
      }
      if (activity.previousSessionId) {
        metadata.push(`Previous: ${activity.previousSessionId}`);
      }
      break;
    case "session_finished":
      if (activity.turnCount !== undefined) {
        metadata.push(`Turns: ${activity.turnCount}`);
      }
      if (activity.providerSessionId) {
        metadata.push(`Session: ${activity.providerSessionId}`);
      }
      if (activity.exitCode !== undefined) {
        metadata.push(`Exit: ${activity.exitCode}`);
      }
      break;
    case "session_stop_blocked":
    case "session_stop_failed":
      if (activity.stopSource) {
        metadata.push(`Source: ${formatActivityValue(activity.stopSource)}`);
      }
      if (activity.exitCode !== undefined) {
        metadata.push(`Exit: ${activity.exitCode}`);
      }
      break;
    case "context_warning":
      if (activity.severity) {
        metadata.push(`Severity: ${formatActivityValue(activity.severity)}`);
      }
      if (activity.warningType) {
        metadata.push(`Type: ${formatActivityValue(activity.warningType)}`);
      }
      if (activity.usagePercent !== undefined) {
        metadata.push(`Usage: ${Math.round(activity.usagePercent)}%`);
      }
      break;
    case "context_compacted":
      if (activity.reductionPercent !== undefined) {
        metadata.push(`Reduced: ${Math.round(activity.reductionPercent)}%`);
      }
      if (activity.previousBytes !== undefined && activity.newBytes !== undefined) {
        metadata.push(`${formatBytes(activity.previousBytes)} -> ${formatBytes(activity.newBytes)}`);
      }
      break;
    case "memory_scope_changed":
      if (activity.scopeType) {
        metadata.push(`Scope: ${formatActivityValue(activity.scopeType)}`);
      }
      if (activity.scopeAction) {
        metadata.push(`Action: ${formatActivityValue(activity.scopeAction)}`);
      }
      if (activity.scopeBytes !== undefined) {
        metadata.push(`Size: ${formatBytes(activity.scopeBytes)}`);
      }
      break;
    case "approval_required":
      if (activity.approvalId) {
        metadata.push(`Approval: ${activity.approvalId}`);
      }
      break;
    case "approval_resolved":
      if (activity.resolution) {
        metadata.push(`Resolution: ${formatActivityValue(activity.resolution)}`);
      }
      if (activity.resolvedBy) {
        metadata.push(`By: ${activity.resolvedBy}`);
      }
      if (activity.approvalId) {
        metadata.push(`Approval: ${activity.approvalId}`);
      }
      break;
    case "user_prompt":
    case "prompt_submitted":
      if (activity.turnNumber !== undefined) {
        metadata.push(`Turn: ${activity.turnNumber}`);
      }
      if (activity.promptSource) {
        metadata.push(`Source: ${formatActivityValue(activity.promptSource)}`);
      }
      if (activity.promptLength !== undefined) {
        metadata.push(`Prompt: ${activity.promptLength} chars`);
      }
      break;
    case "run_resumed":
      if (activity.resumeReason) {
        metadata.push(`Reason: ${formatActivityValue(activity.resumeReason)}`);
      }
      if (activity.checkpointRef) {
        metadata.push(`Checkpoint: ${activity.checkpointRef}`);
      }
      if (activity.previousSessionId) {
        metadata.push(`Previous: ${activity.previousSessionId}`);
      }
      break;
    case "mcp_capabilities_negotiated":
      if (activity.serverName) {
        metadata.push(`Server: ${activity.serverName}`);
      }
      if (activity.transport) {
        metadata.push(`Transport: ${activity.transport}`);
      }
      if (activity.protocolVersion) {
        metadata.push(`Protocol: ${activity.protocolVersion}`);
      }
      if (activity.toolCount !== undefined) {
        metadata.push(`Tools: ${activity.toolCount}`);
      }
      if (activity.resourceCount !== undefined) {
        metadata.push(`Resources: ${activity.resourceCount}`);
      }
      break;
  }

  if (activity.durationMs !== undefined && activity.durationMs > 0) {
    metadata.push(`Duration: ${formatActivityDuration(activity.durationMs)}`);
  }

  return metadata;
}

function getActivitySecondaryText(activity: ActivityLike): string | null {
  const trimmedDetail = activity.detail?.trim();
  if (trimmedDetail && trimmedDetail !== activity.summary.trim()) {
    return trimmedDetail;
  }

  const normalizedType = normalizeActivityType(activity.type);
  if (normalizedType === "session_stop_blocked" && activity.continuationPrompt) {
    return `Continuation prompt: ${activity.continuationPrompt}`;
  }

  if (normalizedType === "mcp_capabilities_negotiated") {
    const capabilities = getEnabledMcpCapabilities(activity.mcpCapabilities);
    if (capabilities.length > 0) {
      return `Capabilities: ${capabilities.map(formatActivityValue).join(", ")}`;
    }
  }

  return null;
}

function getActivitySearchText(activity: ActivityLike): string {
  return [
    activity.type,
    getActivityConfig(activity.type).label,
    activity.summary,
    activity.toolName,
    activity.detail,
    getActivitySecondaryText(activity),
    ...getActivityMetadata(activity),
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

interface ActivityStreamProps {
  taskRunId: Id<"taskRuns">;
  /** Provider name for event coverage indicators (e.g., "claude", "codex") */
  provider?: string;
}

export function ActivityStream({ taskRunId, provider }: ActivityStreamProps) {
  const activities = useQuery(api.taskRunActivity.getByTaskRunAsc, {
    taskRunId,
    limit: 200,
  });
  const [pinToBottom, setPinToBottom] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<ActivityType>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Filter and search activities
  const filteredActivities = useMemo(() => {
    if (!activities) return [];

    let result = activities;

    // Apply type filters
    if (activeFilters.size > 0) {
      result = result.filter(
        (activity) => isKnownActivityType(activity.type) && activeFilters.has(activity.type)
      );
    }

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((activity) => getActivitySearchText(activity).includes(query));
    }

    return result;
  }, [activities, activeFilters, searchQuery]);

  // Auto-scroll effect
  useEffect(() => {
    if (pinToBottom && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [filteredActivities, pinToBottom]);

  // Toggle filter
  const toggleFilter = useCallback((type: ActivityType) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  }, []);

  // Clear all filters
  const clearFilters = useCallback(() => {
    setActiveFilters(new Set());
    setSearchQuery("");
  }, []);

  // Export as JSON
  const exportAsJson = useCallback(() => {
    if (!filteredActivities.length) return;

    const exportData = filteredActivities.map((a) => ({
      type: a.type,
      summary: a.summary,
      toolName: a.toolName,
      createdAt: formatTimestamp(a.createdAt),
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${taskRunId}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredActivities, taskRunId]);

  // Export as CSV
  const exportAsCsv = useCallback(() => {
    if (!filteredActivities.length) return;

    const headers = ["Type", "Summary", "Tool", "Timestamp"];
    const rows = filteredActivities.map((a) => [
      a.type,
      `"${a.summary.replace(/"/g, '""')}"`,
      a.toolName ?? "",
      formatTimestamp(a.createdAt),
    ]);

    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `activity-${taskRunId}-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [filteredActivities, taskRunId]);

  // Loading state
  if (!activities) {
    return <ActivityStreamSkeleton />;
  }

  // Empty state (no activities at all)
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 text-neutral-500 dark:text-neutral-400">
        <Wrench className="h-8 w-8 opacity-50" />
        <p className="text-sm">No activity events yet</p>
        <p className="text-xs">Events will appear here as the agent works</p>
      </div>
    );
  }

  // Stats
  const editCount = activities.filter((a) => a.type === "file_edit").length;
  const commandCount = activities.filter((a) => a.type === "bash_command").length;
  const errorCount = activities.filter((a) => a.type === "error").length;

  const hasActiveFilters = activeFilters.size > 0 || searchQuery.trim().length > 0;

  // Check if provider has limited event coverage (not Claude)
  const hasLimitedCoverage = provider && provider !== "claude";

  return (
    <div className="flex flex-col h-full">
      {/* Limited coverage info banner */}
      {hasLimitedCoverage && (
        <div className="px-3 py-2 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-900 flex items-center gap-2">
          <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />
          <span className="text-xs text-blue-700 dark:text-blue-300">
            Some event types are not available for {provider}. Grayed-out filters indicate unsupported events.
          </span>
        </div>
      )}

      {/* Error banner */}
      {errorCount > 0 && (
        <div className="px-3 py-2 bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-red-500" />
          <span className="text-sm font-medium text-red-700 dark:text-red-300">
            {errorCount} error{errorCount > 1 ? "s" : ""} encountered
          </span>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800">
        {/* Stats and actions row */}
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
            <span>
              {hasActiveFilters
                ? `${filteredActivities.length}/${activities.length}`
                : activities.length}{" "}
              events
            </span>
            {editCount > 0 && (
              <span className="text-blue-600 dark:text-blue-400">
                {editCount} edit{editCount > 1 ? "s" : ""}
              </span>
            )}
            {commandCount > 0 && (
              <span className="text-green-600 dark:text-green-400">
                {commandCount} cmd{commandCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1.5 rounded transition-colors ${
                showFilters || activeFilters.size > 0
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
              }`}
              title="Filter by type"
            >
              <Filter className="h-3.5 w-3.5" />
            </button>

            {/* Export dropdown */}
            <div className="relative group">
              <button
                className="p-1.5 rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
                title="Export"
              >
                <Download className="h-3.5 w-3.5" />
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block z-10">
                <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg py-1 min-w-[100px]">
                  <button
                    onClick={exportAsJson}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Export JSON
                  </button>
                  <button
                    onClick={exportAsCsv}
                    className="w-full px-3 py-1.5 text-xs text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                  >
                    Export CSV
                  </button>
                </div>
              </div>
            </div>

            {/* Auto-scroll toggle */}
            <button
              onClick={() => setPinToBottom(!pinToBottom)}
              className={`text-xs px-2 py-0.5 rounded ${
                pinToBottom
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
              }`}
            >
              {pinToBottom ? "Auto-scroll ON" : "Auto-scroll OFF"}
            </button>
          </div>
        </div>

        {/* Search and filters row */}
        {showFilters && (
          <div className="px-3 py-2 border-t border-neutral-100 dark:border-neutral-800 space-y-2">
            {/* Search input */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-neutral-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search activities..."
                className="w-full h-7 pl-7 pr-7 text-xs rounded border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Type filter chips */}
            <div className="flex flex-wrap gap-1">
              {ACTIVITY_TYPES.map((type) => {
                const { icon: Icon, label } = getActivityConfig(type);
                const isActive = activeFilters.has(type);
                const count = activities.filter((a) => a.type === type).length;
                const isSupported = !provider || isActivityTypeSupported(type, provider);

                // Show chip if there are events OR if provider doesn't support this type (to explain why it's missing)
                if (count === 0 && isSupported) return null;

                return (
                  <button
                    key={type}
                    onClick={() => isSupported && toggleFilter(type)}
                    disabled={!isSupported}
                    title={
                      isSupported
                        ? undefined
                        : `Not available for ${provider} provider`
                    }
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs transition-colors ${
                      !isSupported
                        ? "bg-neutral-50 text-neutral-400 dark:bg-neutral-900 dark:text-neutral-600 cursor-not-allowed opacity-60"
                        : isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
                    }`}
                  >
                    <Icon className="h-3 w-3" />
                    {label} {count > 0 ? `(${count})` : ""}
                    {!isSupported && <Info className="h-2.5 w-2.5 ml-0.5" />}
                  </button>
                );
              })}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                >
                  <X className="h-3 w-3" />
                  Clear
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Activity list */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={() => {
          if (!scrollRef.current) return;
          const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
          const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
          if (isAtBottom !== pinToBottom) setPinToBottom(isAtBottom);
        }}
      >
        {filteredActivities.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-neutral-500 dark:text-neutral-400">
            <Search className="h-6 w-6 opacity-50 mb-2" />
            <p className="text-sm">No matching activities</p>
            <button
              onClick={clearFilters}
              className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400"
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100 dark:divide-neutral-900">
            {filteredActivities.map((activity) => {
              const normalizedType = normalizeActivityType(activity.type);
              const { icon: Icon, colorClass, badgeClass, label } = getActivityConfig(
                activity.type
              );
              const metadata = getActivityMetadata(activity);
              const secondaryText = getActivitySecondaryText(activity);
              const isError = normalizedType === "error" || normalizedType === "session_stop_failed";
              const isWarning =
                normalizedType === "approval_required" ||
                normalizedType === "session_stop_blocked" ||
                normalizedType === "context_warning";

              return (
                <div
                  key={activity._id}
                  className={`flex items-start gap-2 px-3 py-2 ${
                    isError
                      ? "bg-red-50 dark:bg-red-950/30 border-l-2 border-red-500"
                      : isWarning
                        ? "bg-amber-50/60 dark:bg-amber-950/20 border-l-2 border-amber-400"
                      : "hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                  }`}
                >
                  <Icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${colorClass}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${badgeClass}`}
                      >
                        {label}
                      </span>
                      {metadata.map((item) => (
                        <span
                          key={`${activity._id}-${item}`}
                          className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-0.5 text-[11px] text-neutral-600 dark:bg-neutral-900 dark:text-neutral-400"
                        >
                          {item}
                        </span>
                      ))}
                    </div>
                    <p className="text-sm text-neutral-800 dark:text-neutral-200 break-words">
                      {activity.summary}
                    </p>
                    {secondaryText && (
                      <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400 break-words">
                        {secondaryText}
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-neutral-400 dark:text-neutral-600 flex-shrink-0 whitespace-nowrap">
                    {formatRelativeTime(activity.createdAt)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
