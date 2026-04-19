/**
 * PlanEditor Component
 *
 * Editable plans use a list-first task editor that is easier to review and
 * adjust when seeding tasks from GitHub Projects. Dispatched plans keep a
 * lightweight graph view so dependency structure remains visible.
 */

import {
  useState,
  useCallback,
  useMemo,
  useId,
  useRef,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  Link2,
  Loader2,
  Play,
  Plus,
  Save,
  Trash2,
  Upload,
  Users,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import clsx from "clsx";

import { Button } from "@/components/ui/button";

// ============================================================================
// Types
// ============================================================================

export interface PlanTask {
  id: string;
  prompt: string;
  agentName: string;
  status: string;
  dependsOn?: string[];
  priority?: number;
  orchestrationTaskId?: string;
}

export interface Plan {
  orchestrationId: string;
  headAgent: string;
  description?: string;
  tasks: PlanTask[];
}

interface TaskStatusInfo {
  status: string;
  result?: string;
  errorMessage?: string;
}

interface PlanEditorProps {
  plan?: Plan;
  availableAgents?: string[];
  onSave?: (plan: Plan) => Promise<void>;
  className?: string;
  readOnly?: boolean;
  taskStatuses?: Map<string, TaskStatusInfo>;
  taskCountOverride?: number;
  emptyStateSupplement?: ReactNode;
}

interface AgentSelectProps {
  id: string;
  name: string;
  value: string;
  agents: string[];
  onChange: (value: string) => void;
  ariaLabel: string;
  className?: string;
}

interface EditableTaskCardProps {
  task: PlanTask;
  taskIndex: number;
  tasks: PlanTask[];
  availableAgents: string[];
  onUpdate: (updates: Partial<PlanTask>) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleDependency: (dependencyId: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  statusInfo?: TaskStatusInfo;
}

interface TaskGraphCardProps {
  task: PlanTask;
  position: { x: number; y: number };
  statusInfo?: TaskStatusInfo;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_AGENTS = [
  "claude/opus-4.7",
  "claude/opus-4.5",
  "claude/sonnet-4.5",
  "claude/haiku-4.5",
  "codex/gpt-5.4-xhigh",
  "codex/gpt-5.2-xhigh",
  "codex/gpt-5.1-codex-mini",
];

const CARD_WIDTH = 280;
const CARD_HEIGHT = 144;
const LEVEL_GAP = 100;
const CARD_GAP = 24;
const PADDING = 32;

// ============================================================================
// Utility Functions
// ============================================================================

function generateTaskId(): string {
  return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateOrchestrationId(): string {
  return `orch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isPlanTask(value: unknown): value is PlanTask {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    typeof value.prompt === "string" &&
    typeof value.agentName === "string" &&
    typeof value.status === "string" &&
    (value.dependsOn === undefined ||
      (Array.isArray(value.dependsOn) &&
        value.dependsOn.every((dependencyId) => typeof dependencyId === "string"))) &&
    (value.priority === undefined || typeof value.priority === "number") &&
    (value.orchestrationTaskId === undefined ||
      typeof value.orchestrationTaskId === "string")
  );
}

function isPlan(value: unknown): value is Plan {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.orchestrationId === "string" &&
    typeof value.headAgent === "string" &&
    (value.description === undefined || typeof value.description === "string") &&
    Array.isArray(value.tasks) &&
    value.tasks.every(isPlanTask)
  );
}

function getAgentShortName(agentName: string): string {
  return agentName.split("/")[1] ?? agentName;
}

function getTaskTitle(prompt: string): string {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return "(untitled task)";
  }

  return trimmedPrompt.split(/\n+/)[0] ?? "(untitled task)";
}

function getTaskExcerpt(prompt: string): string | null {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return null;
  }

  const lines = trimmedPrompt
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length <= 1) {
    return lines[0] ?? null;
  }

  return lines.slice(1).join(" ");
}

function isSeededGitHubTask(task: PlanTask): boolean {
  return task.id.startsWith("github_item_");
}

/**
 * Compute task levels based on dependencies (topological sort).
 */
function computeTaskLevels(tasks: PlanTask[]): Map<string, number> {
  const levels = new Map<string, number>();
  const taskMap = new Map(tasks.map((task) => [task.id, task]));

  function getLevel(id: string, visiting = new Set<string>()): number {
    const existingLevel = levels.get(id);
    if (existingLevel !== undefined) {
      return existingLevel;
    }
    if (visiting.has(id)) {
      return 0;
    }

    visiting.add(id);
    const task = taskMap.get(id);
    if (!task?.dependsOn?.length) {
      levels.set(id, 0);
      visiting.delete(id);
      return 0;
    }

    let maxDependencyLevel = 0;
    for (const dependencyId of task.dependsOn) {
      if (!taskMap.has(dependencyId)) {
        continue;
      }
      maxDependencyLevel = Math.max(
        maxDependencyLevel,
        getLevel(dependencyId, visiting) + 1,
      );
    }

    visiting.delete(id);
    levels.set(id, maxDependencyLevel);
    return maxDependencyLevel;
  }

  for (const task of tasks) {
    getLevel(task.id);
  }

  return levels;
}

/**
 * Compute node positions for visual layout.
 */
function computeNodePositions(
  tasks: PlanTask[],
  levels: Map<string, number>,
): Map<string, { x: number; y: number }> {
  const positions = new Map<string, { x: number; y: number }>();
  const levelGroups = new Map<number, PlanTask[]>();

  for (const task of tasks) {
    const level = levels.get(task.id) ?? 0;
    const group = levelGroups.get(level) ?? [];
    group.push(task);
    levelGroups.set(level, group);
  }

  for (const [level, group] of levelGroups) {
    group.forEach((task, index) => {
      positions.set(task.id, {
        x: PADDING + level * (CARD_WIDTH + LEVEL_GAP),
        y: PADDING + index * (CARD_HEIGHT + CARD_GAP),
      });
    });
  }

  return positions;
}

// ============================================================================
// UI Components
// ============================================================================

function StatusBadge({ status }: { status: string }) {
  const config: Record<
    string,
    { icon: LucideIcon; className: string; label: string }
  > = {
    completed: {
      icon: CheckCircle2,
      className:
        "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
      label: "Completed",
    },
    running: {
      icon: Play,
      className:
        "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
      label: "Running",
    },
    assigned: {
      icon: Loader2,
      className:
        "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
      label: "Assigned",
    },
    pending: {
      icon: Clock,
      className:
        "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
      label: "Pending",
    },
    failed: {
      icon: XCircle,
      className:
        "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300",
      label: "Failed",
    },
  };
  const resolvedConfig = config[status] ?? config.pending;
  const Icon = resolvedConfig.icon;

  return (
    <span
      className={clsx(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium",
        resolvedConfig.className,
      )}
    >
      <Icon
        className={clsx(
          "size-3",
          (status === "running" || status === "assigned") && "animate-spin",
        )}
      />
      {resolvedConfig.label}
    </span>
  );
}

function AgentSelect({
  id,
  name,
  value,
  agents,
  onChange,
  ariaLabel,
  className,
}: AgentSelectProps) {
  return (
    <div className={clsx("relative", className)}>
      <select
        id={id}
        name={name}
        value={value}
        aria-label={ariaLabel}
        onChange={(event: ChangeEvent<HTMLSelectElement>) =>
          onChange(event.target.value)
        }
        className="h-10 w-full appearance-none rounded-md border border-neutral-200 bg-white px-3 pr-10 text-sm text-neutral-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
      >
        {agents.map((agent) => (
          <option key={agent} value={agent}>
            {agent}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400" />
    </div>
  );
}

function EditableTaskCard({
  task,
  taskIndex,
  tasks,
  availableAgents,
  onUpdate,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleDependency,
  canMoveUp,
  canMoveDown,
  statusInfo,
}: EditableTaskCardProps) {
  const [dependenciesOpen, setDependenciesOpen] = useState(
    Boolean(task.dependsOn?.length),
  );
  const promptInputId = `plan-task-${task.id}-prompt`;
  const modelInputId = `plan-task-${task.id}-agent`;

  const dependencyOptions = tasks.filter((otherTask) => otherTask.id !== task.id);
  const dependencyLabels = (task.dependsOn ?? [])
    .map((dependencyId) => {
      const dependencyIndex = tasks.findIndex(
        (otherTask) => otherTask.id === dependencyId,
      );
      if (dependencyIndex < 0) {
        return null;
      }

      const dependencyTask = tasks[dependencyIndex];
      if (!dependencyTask) {
        return null;
      }

      return getTaskTitle(dependencyTask.prompt);
    })
    .filter((label): label is string => label !== null);

  return (
    <article className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-4 dark:border-neutral-800 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200">
              Task {taskIndex + 1}
            </span>
            {isSeededGitHubTask(task) && (
              <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[11px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                Linked GitHub item
              </span>
            )}
            <StatusBadge status={statusInfo?.status ?? task.status} />
          </div>
          <p className="mt-3 text-sm font-medium text-neutral-900 dark:text-neutral-100">
            {getTaskTitle(task.prompt)}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            {dependencyLabels.length > 0
              ? `Depends on ${dependencyLabels.join(" • ")}`
              : "No dependencies"}
          </p>
        </div>

        <div className="flex items-center gap-2 self-start">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move task ${taskIndex + 1} up`}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move task ${taskIndex + 1} down`}
          >
            <ArrowDown className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onDelete}
            aria-label={`Delete task ${taskIndex + 1}`}
            className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/30 dark:hover:text-red-300"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-4 px-4 py-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="space-y-2">
          <label
            htmlFor={promptInputId}
            className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Prompt
          </label>
          <textarea
            id={promptInputId}
            name={promptInputId}
            value={task.prompt}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
              onUpdate({ prompt: event.target.value })
            }
            rows={6}
            placeholder="Describe what this task should accomplish..."
            className="min-h-[148px] w-full rounded-lg border border-neutral-200 bg-white px-3 py-3 text-sm text-neutral-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
          />
          {statusInfo?.errorMessage && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-950/60 dark:bg-red-950/30 dark:text-red-300">
              {statusInfo.errorMessage}
            </div>
          )}
          {statusInfo?.result && (
            <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700 dark:border-green-950/60 dark:bg-green-950/30 dark:text-green-300">
              {statusInfo.result}
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="space-y-2">
            <label
              htmlFor={modelInputId}
              className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
            >
              Model
            </label>
            <AgentSelect
              id={modelInputId}
              name={modelInputId}
              value={task.agentName}
              agents={availableAgents}
              onChange={(agentName) => onUpdate({ agentName })}
              ariaLabel={`Model for task ${taskIndex + 1}`}
            />
          </div>

          <div className="rounded-lg border border-neutral-200 bg-neutral-50/70 p-3 dark:border-neutral-800 dark:bg-neutral-950/50">
            <button
              type="button"
              onClick={() => setDependenciesOpen((currentState) => !currentState)}
              className="flex w-full items-center justify-between gap-3 text-left"
            >
              <span className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-100">
                <Link2 className="size-4 text-neutral-500 dark:text-neutral-400" />
                Dependencies
              </span>
              <span className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
                {(task.dependsOn?.length ?? 0) === 0
                  ? "None selected"
                  : `${task.dependsOn?.length ?? 0} selected`}
                <ChevronDown
                  className={clsx(
                    "size-4 transition-transform",
                    dependenciesOpen && "rotate-180",
                  )}
                />
              </span>
            </button>

            {dependenciesOpen && (
              <div className="mt-3 space-y-2">
                {dependencyOptions.length === 0 ? (
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Add another task to create dependencies.
                  </p>
                ) : (
                  dependencyOptions.map((dependencyTask, dependencyIndex) => {
                    const isChecked =
                      task.dependsOn?.includes(dependencyTask.id) ?? false;
                    const absoluteTaskIndex = tasks.findIndex(
                      (otherTask) => otherTask.id === dependencyTask.id,
                    );

                    return (
                      <label
                        key={dependencyTask.id}
                        className="flex items-start gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200"
                      >
                        <input
                          type="checkbox"
                          id={`plan-task-${task.id}-dependency-${dependencyTask.id}`}
                          name={`plan-task-${task.id}-dependency-${dependencyTask.id}`}
                          checked={isChecked}
                          onChange={() => onToggleDependency(dependencyTask.id)}
                          className="mt-0.5 size-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-950"
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            Task {(absoluteTaskIndex >= 0 ? absoluteTaskIndex : dependencyIndex) + 1}
                          </span>
                          <span className="block text-xs text-neutral-500 dark:text-neutral-400">
                            {getTaskTitle(dependencyTask.prompt)}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function TaskGraphCard({
  task,
  position,
  statusInfo,
}: TaskGraphCardProps) {
  const promptExcerpt = getTaskExcerpt(task.prompt);

  return (
    <div
      className="absolute overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
      style={{
        left: position.x,
        top: position.y,
        width: CARD_WIDTH,
        minHeight: CARD_HEIGHT,
      }}
    >
      <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {getAgentShortName(task.agentName)}
          </span>
          {isSeededGitHubTask(task) && !statusInfo && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
              GitHub
            </span>
          )}
          <StatusBadge status={statusInfo?.status ?? task.status} />
        </div>
      </div>

      <div className="space-y-2 p-3">
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {getTaskTitle(task.prompt)}
        </p>
        {promptExcerpt && (
          <p className="line-clamp-3 text-xs text-neutral-600 dark:text-neutral-300">
            {promptExcerpt}
          </p>
        )}
        {statusInfo?.errorMessage && (
          <p className="line-clamp-2 text-[11px] text-red-600 dark:text-red-400">
            {statusInfo.errorMessage}
          </p>
        )}
        {statusInfo?.result && (
          <p className="line-clamp-2 text-[11px] text-green-700 dark:text-green-400">
            {statusInfo.result}
          </p>
        )}
        {(task.dependsOn?.length ?? 0) > 0 && (
          <p className="flex items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <Link2 className="size-3" />
            Depends on {task.dependsOn?.length} task
            {(task.dependsOn?.length ?? 0) === 1 ? "" : "s"}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// PlanEditor Component
// ============================================================================

export function PlanEditor({
  plan: initialPlan,
  availableAgents = DEFAULT_AGENTS,
  onSave,
  className,
  readOnly,
  taskStatuses,
  taskCountOverride,
  emptyStateSupplement,
}: PlanEditorProps) {
  const markerId = useId().replace(/:/g, "-");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditable = !readOnly;

  const [tasks, setTasks] = useState<PlanTask[]>(initialPlan?.tasks ?? []);
  const [orchestrationId, setOrchestrationId] = useState(
    initialPlan?.orchestrationId ?? generateOrchestrationId(),
  );
  const [headAgent, setHeadAgent] = useState(
    initialPlan?.headAgent ?? availableAgents[0],
  );
  const [description, setDescription] = useState(
    initialPlan?.description ?? "",
  );
  const [isSaving, setIsSaving] = useState(false);

  const displayedTaskCount = taskCountOverride ?? tasks.length;
  const headAgentInputId = `${orchestrationId}-head-agent`;
  const descriptionInputId = `${orchestrationId}-description`;

  const { positions, edges, canvasWidth, canvasHeight } = useMemo(() => {
    const taskLevels = computeTaskLevels(tasks);
    const taskPositions = computeNodePositions(tasks, taskLevels);

    const computedEdges: Array<{
      from: { x: number; y: number };
      to: { x: number; y: number };
      key: string;
    }> = [];

    for (const task of tasks) {
      if (!task.dependsOn?.length) {
        continue;
      }

      const taskPosition = taskPositions.get(task.id);
      if (!taskPosition) {
        continue;
      }

      for (const dependencyId of task.dependsOn) {
        const dependencyPosition = taskPositions.get(dependencyId);
        if (!dependencyPosition) {
          continue;
        }

        computedEdges.push({
          from: {
            x: dependencyPosition.x + CARD_WIDTH,
            y: dependencyPosition.y + CARD_HEIGHT / 2,
          },
          to: {
            x: taskPosition.x,
            y: taskPosition.y + CARD_HEIGHT / 2,
          },
          key: `${dependencyId}->${task.id}`,
        });
      }
    }

    const maxLevel = Math.max(...Array.from(taskLevels.values()), 0);
    const levelCounts = new Map<number, number>();
    for (const [, level] of taskLevels) {
      levelCounts.set(level, (levelCounts.get(level) ?? 0) + 1);
    }
    const maxNodesInLevel = Math.max(...Array.from(levelCounts.values()), 1);

    const width =
      PADDING * 2 + (maxLevel + 1) * CARD_WIDTH + maxLevel * LEVEL_GAP;
    const height =
      PADDING * 2 +
      maxNodesInLevel * CARD_HEIGHT +
      (maxNodesInLevel - 1) * CARD_GAP;

    return {
      positions: taskPositions,
      edges: computedEdges,
      canvasWidth: Math.max(width, 600),
      canvasHeight: Math.max(height, 300),
    };
  }, [tasks]);

  const addTask = useCallback(() => {
    const newTask: PlanTask = {
      id: generateTaskId(),
      prompt: "",
      agentName: availableAgents[0],
      status: "pending",
      priority: 5,
    };
    setTasks((previousTasks) => [...previousTasks, newTask]);
  }, [availableAgents]);

  const updateTask = useCallback(
    (taskId: string, updates: Partial<PlanTask>) => {
      setTasks((previousTasks) =>
        previousTasks.map((task) =>
          task.id === taskId ? { ...task, ...updates } : task,
        ),
      );
    },
    [],
  );

  const deleteTask = useCallback((taskId: string) => {
    setTasks((previousTasks) =>
      previousTasks
        .filter((task) => task.id !== taskId)
        .map((task) => ({
          ...task,
          dependsOn: task.dependsOn?.filter(
            (dependencyId) => dependencyId !== taskId,
          ),
        })),
    );
  }, []);

  const moveTask = useCallback((taskId: string, direction: -1 | 1) => {
    setTasks((previousTasks) => {
      const currentIndex = previousTasks.findIndex((task) => task.id === taskId);
      if (currentIndex < 0) {
        return previousTasks;
      }

      const nextIndex = currentIndex + direction;
      if (nextIndex < 0 || nextIndex >= previousTasks.length) {
        return previousTasks;
      }

      const reorderedTasks = [...previousTasks];
      const [task] = reorderedTasks.splice(currentIndex, 1);
      if (!task) {
        return previousTasks;
      }
      reorderedTasks.splice(nextIndex, 0, task);
      return reorderedTasks;
    });
  }, []);

  const toggleDependency = useCallback(
    (taskId: string, dependencyId: string) => {
      setTasks((previousTasks) =>
        previousTasks.map((task) => {
          if (task.id !== taskId || dependencyId === task.id) {
            return task;
          }

          const dependencyIds = new Set(task.dependsOn ?? []);
          if (dependencyIds.has(dependencyId)) {
            dependencyIds.delete(dependencyId);
          } else {
            dependencyIds.add(dependencyId);
          }

          return {
            ...task,
            dependsOn:
              dependencyIds.size > 0 ? Array.from(dependencyIds) : undefined,
          };
        }),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    if (!onSave) {
      return;
    }

    setIsSaving(true);
    try {
      await onSave({
        orchestrationId,
        headAgent,
        description,
        tasks,
      });
    } finally {
      setIsSaving(false);
    }
  }, [description, headAgent, onSave, orchestrationId, tasks]);

  const exportPlan = useCallback(() => {
    const plan: Plan = {
      orchestrationId,
      headAgent,
      description,
      tasks,
    };
    const blob = new Blob([JSON.stringify(plan, null, 2)], {
      type: "application/json",
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = `plan-${orchestrationId}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
  }, [description, headAgent, orchestrationId, tasks]);

  const importPlan = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      const { result } = loadEvent.target ?? {};
      if (typeof result !== "string") {
        console.error("Failed to import plan: file contents were not text");
        return;
      }

      try {
        const parsedPlan = JSON.parse(result);
        if (!isPlan(parsedPlan)) {
          console.error("Failed to import plan: invalid plan shape");
          return;
        }

        setOrchestrationId(parsedPlan.orchestrationId);
        setTasks(parsedPlan.tasks);
        setHeadAgent(parsedPlan.headAgent);
        setDescription(parsedPlan.description ?? "");
      } catch (error) {
        console.error("Failed to import plan:", error);
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }, []);

  return (
    <div
      className={clsx(
        "flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        className,
      )}
    >
      <div className="flex flex-col gap-3 border-b border-neutral-200 px-4 py-3 dark:border-neutral-800 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            Plan Editor
          </h3>
          <span className="rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
            {displayedTaskCount} task{displayedTaskCount === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditable && (
            <Button variant="outline" size="sm" onClick={addTask}>
              <Plus className="size-4" />
              Add Task
            </Button>
          )}
          {isEditable && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="size-4" />
              Import
            </Button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={importPlan}
            className="hidden"
          />
          <Button
            variant="outline"
            size="sm"
            onClick={exportPlan}
            disabled={tasks.length === 0}
          >
            <Download className="size-4" />
            Export
          </Button>
          {onSave && isEditable && (
            <Button
              size="sm"
              onClick={handleSave}
              disabled={isSaving || tasks.length === 0}
            >
              {isSaving ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Save className="size-4" />
              )}
              Save
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 border-b border-neutral-100 px-4 py-4 dark:border-neutral-800 lg:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <div className="space-y-2">
          <label
            htmlFor={headAgentInputId}
            className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Head Agent
          </label>
          {isEditable ? (
            <AgentSelect
              id={headAgentInputId}
              name={headAgentInputId}
              value={headAgent}
              agents={availableAgents}
              onChange={setHeadAgent}
              ariaLabel="Head agent"
            />
          ) : (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
              {headAgent}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <label
            htmlFor={descriptionInputId}
            className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400"
          >
            Plan Description
          </label>
          {isEditable ? (
            <input
              id={descriptionInputId}
              name={descriptionInputId}
              value={description}
              onChange={(event: ChangeEvent<HTMLInputElement>) =>
                setDescription(event.target.value)
              }
              placeholder="Plan description..."
              className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-900 outline-none transition focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-100"
            />
          ) : (
            <div className="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-200">
              {description || "No description"}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>
        {tasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center text-neutral-500">
            <Users className="mb-4 size-12 text-neutral-300 dark:text-neutral-700" />
            <p className="mb-2 text-lg font-medium text-neutral-700 dark:text-neutral-300">
              No tasks yet
            </p>
            <p className="mb-4 max-w-md text-sm text-neutral-500 dark:text-neutral-400">
              {readOnly
                ? "No tasks in this plan."
                : "Add tasks here or import a plan to start building the project workflow."}
            </p>
            {isEditable && (
              <Button onClick={addTask}>
                <Plus className="size-4" />
                Add First Task
              </Button>
            )}
            {emptyStateSupplement}
          </div>
        ) : isEditable ? (
          <div className="space-y-4 p-4">
            {tasks.map((task, taskIndex) => (
              <EditableTaskCard
                key={task.id}
                task={task}
                taskIndex={taskIndex}
                tasks={tasks}
                availableAgents={availableAgents}
                onUpdate={(updates) => updateTask(task.id, updates)}
                onDelete={() => deleteTask(task.id)}
                onMoveUp={() => moveTask(task.id, -1)}
                onMoveDown={() => moveTask(task.id, 1)}
                onToggleDependency={(dependencyId) =>
                  toggleDependency(task.id, dependencyId)
                }
                canMoveUp={taskIndex > 0}
                canMoveDown={taskIndex < tasks.length - 1}
                statusInfo={taskStatuses?.get(task.id)}
              />
            ))}
          </div>
        ) : (
          <div
            className="relative"
            style={{
              width: canvasWidth,
              height: canvasHeight,
              minWidth: "100%",
            }}
          >
            {edges.length > 0 && (
              <svg
                className="pointer-events-none absolute inset-0"
                width={canvasWidth}
                height={canvasHeight}
              >
                <defs>
                  <marker
                    id={markerId}
                    markerWidth="8"
                    markerHeight="6"
                    refX="7"
                    refY="3"
                    orient="auto"
                  >
                    <polygon
                      points="0 0, 8 3, 0 6"
                      className="fill-neutral-400 dark:fill-neutral-500"
                    />
                  </marker>
                </defs>
                {edges.map((edge) => {
                  const horizontalDistance = edge.to.x - edge.from.x;
                  const controlPoint = horizontalDistance * 0.4;
                  const pathData = `M ${edge.from.x} ${edge.from.y} C ${edge.from.x + controlPoint} ${edge.from.y}, ${edge.to.x - controlPoint} ${edge.to.y}, ${edge.to.x} ${edge.to.y}`;

                  return (
                    <path
                      key={edge.key}
                      d={pathData}
                      fill="none"
                      className="stroke-neutral-300 dark:stroke-neutral-600"
                      strokeWidth={1.5}
                      markerEnd={`url(#${markerId})`}
                    />
                  );
                })}
              </svg>
            )}

            {tasks.map((task) => {
              const position = positions.get(task.id);
              if (!position) {
                return null;
              }

              return (
                <TaskGraphCard
                  key={task.id}
                  task={task}
                  position={position}
                  statusInfo={taskStatuses?.get(task.id)}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
