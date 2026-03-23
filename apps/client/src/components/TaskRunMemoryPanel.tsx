import { useState, useMemo } from "react";
import { useQuery } from "convex/react";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { Brain, FileText, Calendar, CheckSquare, Mail, AlertCircle, Clock, ArrowRight, Megaphone, MessageSquare, CheckCheck, Zap, ListChecks, FolderTree, Sparkles, Eye, Activity, ChevronDown, ChevronUp, TriangleAlert, Layers } from "lucide-react";
import clsx from "clsx";

export interface TaskRunMemoryPanelProps {
  teamSlugOrId: string;
  taskRunId: Id<"taskRuns"> | null | undefined;
}

// Factual memory types (project facts and state)
type FactualMemoryType = "knowledge" | "daily" | "tasks" | "mailbox";

// Behavior memory types (self-improving preferences)
type BehaviorMemoryType = "behavior_hot" | "behavior_corrections" | "behavior_domain" | "behavior_project" | "behavior_index" | "behavior_provenance";

type MemoryType = FactualMemoryType | BehaviorMemoryType;

// Group types for tab organization
type MemoryCategory = "factual" | "behavior";

const MEMORY_TYPE_LABELS: Record<MemoryType, string> = {
  // Factual
  knowledge: "Knowledge",
  daily: "Daily Logs",
  tasks: "Tasks",
  mailbox: "Mailbox",
  // Behavior
  behavior_hot: "HOT Rules",
  behavior_corrections: "Corrections",
  behavior_domain: "Domain Rules",
  behavior_project: "Project Rules",
  behavior_index: "Index",
  behavior_provenance: "Applied",
};

const MEMORY_TYPE_ICONS: Record<MemoryType, React.ElementType> = {
  // Factual
  knowledge: Brain,
  daily: Calendar,
  tasks: CheckSquare,
  mailbox: Mail,
  // Behavior
  behavior_hot: Zap,
  behavior_corrections: ListChecks,
  behavior_domain: FolderTree,
  behavior_project: FileText,
  behavior_index: Sparkles,
  behavior_provenance: Eye,
};

const FACTUAL_MEMORY_TYPES: FactualMemoryType[] = ["knowledge", "daily", "tasks", "mailbox"];
const BEHAVIOR_MEMORY_TYPES: BehaviorMemoryType[] = ["behavior_provenance", "behavior_hot", "behavior_corrections", "behavior_domain", "behavior_project", "behavior_index"];

export function TaskRunMemoryPanel({ teamSlugOrId, taskRunId }: TaskRunMemoryPanelProps) {
  const [selectedCategory, setSelectedCategory] = useState<MemoryCategory>("factual");
  const [selectedType, setSelectedType] = useState<MemoryType>("knowledge");
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showHealthDetails, setShowHealthDetails] = useState(false);

  const snapshots = useQuery(
    api.agentMemoryQueries.getByTaskRun,
    taskRunId ? { teamSlugOrId, taskRunId } : "skip"
  );

  // Query provenance data (rules applied during this task run)
  const provenance = useQuery(
    api.agentMemoryQueries.getBehaviorRulesForTaskRun,
    taskRunId ? { teamSlugOrId, taskRunId } : "skip"
  );

  // Query context health summary (P5)
  const contextHealth = useQuery(
    api.taskRuns.getContextHealth,
    taskRunId ? { teamSlugOrId, id: taskRunId } : "skip"
  );

  // Group snapshots by type
  const snapshotsByType = useMemo(() => {
    if (!snapshots) return null;

    const grouped: Record<Exclude<MemoryType, "behavior_provenance">, typeof snapshots> = {
      // Factual
      knowledge: [],
      daily: [],
      tasks: [],
      mailbox: [],
      // Behavior
      behavior_hot: [],
      behavior_corrections: [],
      behavior_domain: [],
      behavior_project: [],
      behavior_index: [],
    };

    for (const snapshot of snapshots) {
      const type = snapshot.memoryType as Exclude<MemoryType, "behavior_provenance">;
      if (type in grouped) {
        grouped[type].push(snapshot);
      }
    }

    // Sort daily logs by date (newest first)
    grouped.daily.sort((a, b) => {
      const dateA = a.date ?? "";
      const dateB = b.date ?? "";
      return dateB.localeCompare(dateA);
    });

    return grouped;
  }, [snapshots]);

  // Check if any behavior memory exists (including provenance)
  const hasBehaviorMemory = useMemo(() => {
    // Check provenance data
    const hasProvenance = provenance && (provenance.rules.length > 0 || provenance.events.length > 0);
    if (hasProvenance) return true;
    // Check snapshot-based behavior memory
    if (!snapshotsByType) return false;
    const snapshotTypes = ["behavior_hot", "behavior_corrections", "behavior_domain", "behavior_project", "behavior_index"] as const;
    return snapshotTypes.some((type) => snapshotsByType[type]?.length > 0);
  }, [snapshotsByType, provenance]);

  // Get provenance count for tab display
  const provenanceCount = provenance?.rules.length ?? 0;

  // Get available dates for daily logs
  const dailyDates = useMemo(() => {
    if (!snapshotsByType?.daily) return [];
    return snapshotsByType.daily.map((s) => s.date).filter((d): d is string => Boolean(d));
  }, [snapshotsByType?.daily]);

  // Get the selected snapshot content
  const selectedContent = useMemo(() => {
    // Provenance is handled separately
    if (selectedType === "behavior_provenance") return null;

    if (!snapshotsByType) return null;

    if (selectedType === "daily") {
      // For daily logs, show the selected date's content
      const dateToShow = selectedDate ?? dailyDates[0];
      if (!dateToShow) return null;
      const snapshot = snapshotsByType.daily.find((s) => s.date === dateToShow);
      return snapshot ?? null;
    }

    // For other types, get the first (and only) snapshot
    const typeSnapshots = snapshotsByType[selectedType as keyof typeof snapshotsByType];
    return typeSnapshots?.[0] ?? null;
  }, [snapshotsByType, selectedType, selectedDate, dailyDates]);

  // Empty state - no task run selected (check before loading to avoid spinner when skipped)
  if (!taskRunId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-neutral-500 dark:text-neutral-400">
        <Brain className="size-8 text-neutral-400 dark:text-neutral-500" />
        <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
          No run selected
        </div>
        <p className="text-xs">Select a task run to view its memory</p>
      </div>
    );
  }

  // Loading state (only shown when taskRunId exists but data is loading)
  if (snapshots === undefined) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400">
        <div className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
        <span className="text-sm">Loading memory...</span>
      </div>
    );
  }

  // Empty state - no memory synced
  if (!snapshots || snapshots.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-neutral-500 dark:text-neutral-400">
        <Brain className="size-8 text-neutral-400 dark:text-neutral-500" />
        <div className="text-sm font-medium text-neutral-600 dark:text-neutral-200">
          No memory synced
        </div>
        <p className="text-xs">Memory will appear here after the agent completes</p>
      </div>
    );
  }

  const renderCategoryButton = (category: MemoryCategory, label: string, icon: React.ElementType) => {
    const Icon = icon;
    const isActive = selectedCategory === category;
    const isDisabled = category === "behavior" && !hasBehaviorMemory;

    return (
      <button
        key={category}
        type="button"
        onClick={() => {
          setSelectedCategory(category);
          // Switch to first type in category
          if (category === "factual") {
            setSelectedType("knowledge");
          } else {
            // Find first behavior type with content (check provenance first)
            if (provenanceCount > 0) {
              setSelectedType("behavior_provenance");
            } else {
              const snapshotBehaviorTypes = ["behavior_hot", "behavior_corrections", "behavior_domain", "behavior_project", "behavior_index"] as const;
              const firstWithContent = snapshotBehaviorTypes.find(
                (type) => (snapshotsByType?.[type]?.length ?? 0) > 0
              );
              setSelectedType(firstWithContent ?? "behavior_provenance");
            }
          }
        }}
        className={clsx(
          "flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
          isActive
            ? "bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-neutral-100"
            : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800",
          isDisabled && "opacity-50 cursor-not-allowed"
        )}
        disabled={isDisabled}
      >
        <Icon className="size-3.5" />
        {label}
      </button>
    );
  };

  const renderTabButton = (type: MemoryType) => {
    const Icon = MEMORY_TYPE_ICONS[type];
    // Provenance uses rules count, others use snapshot count
    const count = type === "behavior_provenance"
      ? provenanceCount
      : (snapshotsByType?.[type as Exclude<MemoryType, "behavior_provenance">]?.length ?? 0);
    const isActive = selectedType === type;

    return (
      <button
        key={type}
        type="button"
        onClick={() => {
          setSelectedType(type);
          if (type === "daily") {
            setSelectedDate(null); // Reset to latest date
          }
        }}
        className={clsx(
          "flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors",
          isActive
            ? "bg-neutral-100 text-neutral-900 dark:bg-neutral-800 dark:text-neutral-100"
            : "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800/50",
          count === 0 && "opacity-50"
        )}
        disabled={count === 0}
      >
        <Icon className="size-3.5" />
        {MEMORY_TYPE_LABELS[type]}
        {count > 0 && (
          <span className="text-[10px] text-neutral-400 dark:text-neutral-500">
            ({count})
          </span>
        )}
      </button>
    );
  };

  const renderContent = () => {
    // Handle provenance specially - it comes from a different query
    if (selectedType === "behavior_provenance") {
      return <BehaviorProvenanceView provenance={provenance} />;
    }

    if (!selectedContent) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400">
          <FileText className="size-6 text-neutral-400 dark:text-neutral-500" />
          <span className="text-sm">No {MEMORY_TYPE_LABELS[selectedType].toLowerCase()} content</span>
        </div>
      );
    }

    const { content, truncated, agentName, createdAt } = selectedContent;

    return (
      <div className="flex h-full min-h-0 flex-col">
        {/* Metadata bar */}
        <div className="flex items-center gap-3 border-b border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
          {agentName && (
            <span className="flex items-center gap-1">
              <span className="font-medium text-neutral-600 dark:text-neutral-300">Agent:</span>
              {agentName}
            </span>
          )}
          {createdAt && (
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {new Date(createdAt).toLocaleString()}
            </span>
          )}
          {truncated && (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3" />
              Truncated
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-3">
          {selectedType === "mailbox" ? (
            // Mailbox - render messages in friendly format, fallback to JSON
            (() => {
              const messages = parseMailboxContent(content);
              if (messages) {
                return <MailboxMessageList messages={messages} />;
              }
              // Fallback to raw JSON if parsing fails
              return (
                <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-700 dark:text-neutral-300">
                  {formatJsonContent(content)}
                </pre>
              );
            })()
          ) : selectedType === "tasks" || selectedType === "behavior_index" ? (
            // Tasks and behavior index - render as formatted JSON
            <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-700 dark:text-neutral-300">
              {formatJsonContent(content)}
            </pre>
          ) : selectedType === "behavior_corrections" ? (
            // Corrections - render JSONL lines
            <BehaviorCorrectionsView content={content} />
          ) : selectedType === "behavior_hot" ? (
            // HOT rules - render with visual indicators
            <BehaviorHotView content={content} />
          ) : (
            // Markdown content - render as preformatted text with basic styling
            <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
              <pre className="whitespace-pre-wrap font-sans text-sm text-neutral-700 dark:text-neutral-300">
                {content}
              </pre>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Context Health Summary (P5) */}
      {contextHealth && (
        <ContextHealthSummary
          health={contextHealth}
          expanded={showHealthDetails}
          onToggle={() => setShowHealthDetails(!showHealthDetails)}
        />
      )}

      {/* Category selector */}
      <div className="flex items-center gap-1 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        {renderCategoryButton("factual", "Factual", Brain)}
        {renderCategoryButton("behavior", "Behavior", Sparkles)}
      </div>

      {/* Type tab bar */}
      <div className="flex items-center gap-1 border-b border-neutral-200 px-2 py-1.5 dark:border-neutral-800">
        {selectedCategory === "factual"
          ? FACTUAL_MEMORY_TYPES.map(renderTabButton)
          : BEHAVIOR_MEMORY_TYPES.map(renderTabButton)}

        {/* Date selector for daily logs */}
        {selectedType === "daily" && dailyDates.length > 1 && (
          <select
            value={selectedDate ?? dailyDates[0] ?? ""}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="ml-auto rounded border border-neutral-200 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-800"
          >
            {dailyDates.map((date) => (
              <option key={date} value={date}>
                {date}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Content area */}
      <div className="flex-1 min-h-0">
        {renderContent()}
      </div>
    </div>
  );
}

function formatJsonContent(content: string): string {
  try {
    const parsed = JSON.parse(content);
    return JSON.stringify(parsed, null, 2);
  } catch {
    // If not valid JSON, return as-is
    return content;
  }
}

// Message type for mailbox entries
interface MailboxMessage {
  id: string;
  from: string;
  to: string;
  type?: "handoff" | "request" | "status";
  message: string;
  timestamp: string;
  read?: boolean;
}

// Parse mailbox content and extract messages
function parseMailboxContent(content: string): MailboxMessage[] | null {
  try {
    const parsed = JSON.parse(content);
    if (parsed.messages && Array.isArray(parsed.messages)) {
      return parsed.messages;
    }
    return null;
  } catch {
    return null;
  }
}

// Get icon for message type
function getMessageTypeIcon(type?: string) {
  switch (type) {
    case "handoff":
      return ArrowRight;
    case "request":
      return MessageSquare;
    case "status":
      return Megaphone;
    default:
      return Mail;
  }
}

// Get color classes for message type
function getMessageTypeColor(type?: string) {
  switch (type) {
    case "handoff":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "request":
      return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "status":
      return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    default:
      return "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400";
  }
}

// Render mailbox messages in a friendly format
function MailboxMessageList({ messages }: { messages: MailboxMessage[] }) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-neutral-500 dark:text-neutral-400">
        <Mail className="size-6 text-neutral-400 dark:text-neutral-500" />
        <span className="text-sm">No messages in mailbox</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {messages.map((msg) => {
        const Icon = getMessageTypeIcon(msg.type);
        const typeColor = getMessageTypeColor(msg.type);
        const timestamp = new Date(msg.timestamp).toLocaleString();
        const isBroadcast = msg.to === "*";

        return (
          <div
            key={msg.id}
            className={clsx(
              "rounded-lg border p-3",
              msg.read
                ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50"
                : "border-neutral-300 bg-white dark:border-neutral-700 dark:bg-neutral-900"
            )}
          >
            {/* Header row */}
            <div className="flex items-center gap-2 text-xs">
              {/* Message type badge */}
              <span className={clsx("inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium", typeColor)}>
                <Icon className="size-3" />
                {msg.type ?? "message"}
              </span>

              {/* From/To */}
              <span className="text-neutral-500 dark:text-neutral-400">
                <span className="font-medium text-neutral-700 dark:text-neutral-300">{msg.from}</span>
                {" "}
                <ArrowRight className="inline-block size-3" />
                {" "}
                <span className="font-medium text-neutral-700 dark:text-neutral-300">
                  {isBroadcast ? "all agents" : msg.to}
                </span>
              </span>

              {/* Read indicator */}
              {msg.read && (
                <span className="ml-auto flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                  <CheckCheck className="size-3" />
                  read
                </span>
              )}
            </div>

            {/* Message content */}
            <div className="mt-2 text-sm text-neutral-700 dark:text-neutral-300 whitespace-pre-wrap">
              {msg.message}
            </div>

            {/* Timestamp */}
            <div className="mt-2 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
              <Clock className="size-3" />
              {timestamp}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Behavior HOT rules view - renders markdown with visual indicators for confirmed rules
function BehaviorHotView({ content }: { content: string }) {
  // Parse HOT.md format to highlight confirmed rules
  const lines = content.split("\n");

  return (
    <div className="space-y-1">
      {lines.map((line, idx) => {
        const isConfirmed = line.includes("[confirmed]");
        const isRule = line.trim().startsWith("-") || line.trim().startsWith("*");

        if (isRule) {
          return (
            <div
              key={idx}
              className={clsx(
                "flex items-start gap-2 rounded px-2 py-1 text-sm",
                isConfirmed
                  ? "bg-green-50 text-green-800 dark:bg-green-900/20 dark:text-green-300"
                  : "text-neutral-700 dark:text-neutral-300"
              )}
            >
              {isConfirmed && <CheckCheck className="mt-0.5 size-4 flex-shrink-0 text-green-600 dark:text-green-400" />}
              <span className="whitespace-pre-wrap">{line}</span>
            </div>
          );
        }

        // Headers and other content
        if (line.startsWith("#")) {
          return (
            <div key={idx} className="mt-3 mb-1 font-semibold text-neutral-900 dark:text-neutral-100">
              {line}
            </div>
          );
        }

        return (
          <div key={idx} className="text-sm text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap">
            {line}
          </div>
        );
      })}
    </div>
  );
}

// Behavior corrections view - renders JSONL with friendly format
function BehaviorCorrectionsView({ content }: { content: string }) {
  // Parse JSONL - each line is a JSON object
  const corrections = content
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  if (corrections.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-neutral-500 dark:text-neutral-400">
        <ListChecks className="size-6 text-neutral-400 dark:text-neutral-500" />
        <span className="text-sm">No corrections logged</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {corrections.map((correction, idx) => (
        <div
          key={correction.id ?? idx}
          className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
        >
          {/* Header with timestamp */}
          <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
            <Clock className="size-3" />
            {correction.timestamp ? new Date(correction.timestamp).toLocaleString() : "Unknown time"}
            {correction.rulePromotedTo && (
              <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <ArrowRight className="size-3" />
                Promoted to {correction.rulePromotedTo}
              </span>
            )}
          </div>

          {/* Wrong action */}
          <div className="mt-2">
            <span className="text-xs font-medium text-red-600 dark:text-red-400">Wrong:</span>
            <div className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">
              {correction.wrongAction}
            </div>
          </div>

          {/* Correct action */}
          <div className="mt-2">
            <span className="text-xs font-medium text-green-600 dark:text-green-400">Correct:</span>
            <div className="mt-0.5 text-sm text-neutral-700 dark:text-neutral-300">
              {correction.correctAction}
            </div>
          </div>

          {/* Learned rule if present */}
          {correction.learnedRule && (
            <div className="mt-2 rounded bg-neutral-50 p-2 dark:bg-neutral-800">
              <span className="text-xs font-medium text-neutral-600 dark:text-neutral-400">Learned rule:</span>
              <div className="mt-0.5 text-sm text-neutral-800 dark:text-neutral-200">
                {correction.learnedRule}
              </div>
            </div>
          )}

          {/* Context if present */}
          {correction.context && (
            <div className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Context: {correction.context}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// Behavior provenance view - shows which rules were applied during the task run
// Uses loose typing since Convex returns complex union types
interface ProvenanceRule {
  _id: string;
  text?: string;
  scope?: string;
  namespace?: string;
  status?: string;
  confidence?: number;
  timesSeen?: number;
  timesUsed?: number;
  sourceType?: string;
  createdAt?: number;
  lastUsedAt?: number;
}

interface ProvenanceEvent {
  _id: string;
  eventType?: string;
  appliedInContext?: string;
  createdAt?: number;
}

interface ProvenanceData {
  rules: ProvenanceRule[];
  events: ProvenanceEvent[];
}

function BehaviorProvenanceView({ provenance }: { provenance: { rules: unknown[]; events: unknown[] } | undefined | null }) {
  // Cast to typed interface after null check
  const typedProvenance = provenance as ProvenanceData | undefined | null;
  if (!typedProvenance) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-neutral-500 dark:text-neutral-400">
        <div className="size-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
        <span className="text-sm">Loading provenance...</span>
      </div>
    );
  }

  // Filter out null rules
  const rules = typedProvenance.rules.filter((r): r is ProvenanceRule => r !== null && r.text !== undefined);
  const events = typedProvenance.events.filter((e): e is ProvenanceEvent => e !== null);

  if (rules.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-neutral-500 dark:text-neutral-400">
        <Eye className="size-8 text-neutral-300 dark:text-neutral-600" />
        <p className="text-sm">No behavior rules were applied in this run</p>
        <p className="text-xs text-neutral-400 dark:text-neutral-500">
          Rules are tracked when agents reference behavior memory
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
          {rules.length} rule{rules.length !== 1 ? "s" : ""} applied
        </span>
        <span className="text-xs text-neutral-400 dark:text-neutral-500">
          {events.length} application{events.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Rules list */}
      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-3">
        {rules.map((rule) => {
          // Find events for this rule
          const ruleEvents = events.filter(
            (e) => e.eventType === "rule_used"
          );

          return (
            <div
              key={rule._id}
              className="rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900"
            >
              {/* Rule header */}
              <div className="flex items-center gap-2 text-xs">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium",
                    rule.scope === "hot" && "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
                    rule.scope === "domain" && "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
                    rule.scope === "project" && "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                  )}
                >
                  <Zap className="size-3" />
                  {rule.scope}
                </span>
                <span className="text-neutral-400 dark:text-neutral-500">
                  {rule.namespace}
                </span>
                <span className="ml-auto flex items-center gap-1 text-neutral-400 dark:text-neutral-500">
                  <CheckCheck className="size-3" />
                  used {rule.timesUsed ?? 0}x
                </span>
              </div>

              {/* Rule text */}
              <div className="mt-2 text-sm text-neutral-700 dark:text-neutral-300">
                {rule.text}
              </div>

              {/* Usage contexts */}
              {ruleEvents.length > 0 && (
                <div className="mt-2 space-y-1">
                  {ruleEvents.slice(0, 3).map((event) => (
                    <div
                      key={event._id}
                      className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
                    >
                      <Clock className="size-3" />
                      <span>{event.createdAt ? new Date(event.createdAt).toLocaleTimeString() : "unknown"}</span>
                      {event.appliedInContext && (
                        <span className="truncate text-neutral-400 dark:text-neutral-500">
                          in {event.appliedInContext}
                        </span>
                      )}
                    </div>
                  ))}
                  {ruleEvents.length > 3 && (
                    <div className="text-xs text-neutral-400 dark:text-neutral-500">
                      +{ruleEvents.length - 3} more applications
                    </div>
                  )}
                </div>
              )}

              {/* Source info */}
              <div className="mt-2 flex items-center gap-2 text-xs text-neutral-400 dark:text-neutral-500">
                <span>Source: {(rule.sourceType ?? "unknown").replace(/_/g, " ")}</span>
                <span>|</span>
                <span>Confidence: {Math.round((rule.confidence ?? 0) * 100)}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Context health summary type
interface ContextHealthData {
  taskRunId: string;
  provider: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  contextWindow?: number;
  usagePercent?: number;
  latestWarningSeverity: "info" | "warning" | "critical" | null;
  topWarningReasons: string[];
  warningCount: number;
  recentCompactionCount: number;
  lastUpdatedAt?: number;
}

// Context health summary component (P5)
function ContextHealthSummary({
  health,
  expanded,
  onToggle,
}: {
  health: ContextHealthData;
  expanded: boolean;
  onToggle: () => void;
}) {
  const usagePercent = health.usagePercent ?? 0;
  const hasWarnings = health.warningCount > 0;
  const hasCompactions = health.recentCompactionCount > 0;

  // Determine overall status color
  const statusColor =
    health.latestWarningSeverity === "critical"
      ? "text-red-600 dark:text-red-400"
      : health.latestWarningSeverity === "warning"
        ? "text-amber-600 dark:text-amber-400"
        : usagePercent > 80
          ? "text-amber-600 dark:text-amber-400"
          : "text-green-600 dark:text-green-400";

  const bgColor =
    health.latestWarningSeverity === "critical"
      ? "bg-red-50 dark:bg-red-900/20"
      : health.latestWarningSeverity === "warning"
        ? "bg-amber-50 dark:bg-amber-900/20"
        : "bg-neutral-50 dark:bg-neutral-900";

  // Format token counts
  const formatTokens = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return n.toString();
  };

  return (
    <div className={clsx("border-b border-neutral-200 dark:border-neutral-800", bgColor)}>
      {/* Compact summary row (always visible) */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-neutral-100/50 dark:hover:bg-neutral-800/50"
      >
        <Activity className={clsx("size-4", statusColor)} />
        <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
          Context Health
        </span>

        {/* Quick stats */}
        <div className="flex items-center gap-3 text-xs text-neutral-500 dark:text-neutral-400">
          {health.contextWindow && (
            <span title="Context usage">
              {Math.round(usagePercent)}% of {formatTokens(health.contextWindow)}
            </span>
          )}
          {hasCompactions && (
            <span className="flex items-center gap-1" title="Compactions">
              <Layers className="size-3" />
              {health.recentCompactionCount}
            </span>
          )}
          {hasWarnings && (
            <span
              className={clsx(
                "flex items-center gap-1",
                health.latestWarningSeverity === "critical"
                  ? "text-red-600 dark:text-red-400"
                  : "text-amber-600 dark:text-amber-400"
              )}
              title="Warnings"
            >
              <TriangleAlert className="size-3" />
              {health.warningCount}
            </span>
          )}
        </div>

        <span className="ml-auto">
          {expanded ? (
            <ChevronUp className="size-4 text-neutral-400" />
          ) : (
            <ChevronDown className="size-4 text-neutral-400" />
          )}
        </span>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-neutral-200 px-3 py-2 dark:border-neutral-700">
          <div className="grid grid-cols-2 gap-3 text-xs">
            {/* Token usage */}
            <div>
              <span className="font-medium text-neutral-600 dark:text-neutral-400">Tokens</span>
              <div className="mt-1 flex items-center gap-2 text-neutral-700 dark:text-neutral-300">
                <span>In: {formatTokens(health.totalInputTokens)}</span>
                <span>Out: {formatTokens(health.totalOutputTokens)}</span>
              </div>
            </div>

            {/* Context window */}
            {health.contextWindow && (
              <div>
                <span className="font-medium text-neutral-600 dark:text-neutral-400">Context</span>
                <div className="mt-1">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 rounded-full bg-neutral-200 dark:bg-neutral-700">
                      <div
                        className={clsx(
                          "h-full rounded-full transition-all",
                          usagePercent > 90
                            ? "bg-red-500"
                            : usagePercent > 80
                              ? "bg-amber-500"
                              : "bg-green-500"
                        )}
                        style={{ width: `${Math.min(usagePercent, 100)}%` }}
                      />
                    </div>
                    <span className="text-neutral-600 dark:text-neutral-400">
                      {Math.round(usagePercent)}%
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Compactions */}
            <div>
              <span className="font-medium text-neutral-600 dark:text-neutral-400">Compactions</span>
              <div className="mt-1 flex items-center gap-1 text-neutral-700 dark:text-neutral-300">
                <Layers className="size-3" />
                {health.recentCompactionCount} recent
              </div>
            </div>

            {/* Provider */}
            <div>
              <span className="font-medium text-neutral-600 dark:text-neutral-400">Provider</span>
              <div className="mt-1 text-neutral-700 dark:text-neutral-300">
                {health.provider}
              </div>
            </div>
          </div>

          {/* Warning reasons */}
          {health.topWarningReasons.length > 0 && (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 p-2 dark:border-amber-800 dark:bg-amber-900/20">
              <span className="text-xs font-medium text-amber-800 dark:text-amber-300">
                Warnings
              </span>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-700 dark:text-amber-400">
                {health.topWarningReasons.map((reason, i) => (
                  <li key={i} className="flex items-start gap-1">
                    <TriangleAlert className="mt-0.5 size-3 flex-shrink-0" />
                    {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Last updated */}
          {health.lastUpdatedAt && (
            <div className="mt-2 flex items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
              <Clock className="size-3" />
              Last updated: {new Date(health.lastUpdatedAt).toLocaleString()}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
