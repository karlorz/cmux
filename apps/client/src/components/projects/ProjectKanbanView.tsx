/**
 * ProjectKanbanView Component
 *
 * Kanban board view for tasks within a project.
 * Supports drag-and-drop task management across status columns.
 */

import { useState, useCallback, useMemo } from "react";
import { GripVertical, MoreHorizontal, User } from "lucide-react";
import clsx from "clsx";
import { STATUS_CONFIG as TASK_STATUS_CONFIG, type TaskStatus } from "@/components/orchestration/status-config";
import type { Doc } from "@cmux/convex/dataModel";

type OrchestrationTask = Doc<"orchestrationTasks">;

// Kanban column configuration
const KANBAN_COLUMNS: Array<{
  id: TaskStatus;
  title: string;
  bgColor: string;
  borderColor: string;
}> = [
  { id: "pending", title: "To Do", bgColor: "bg-neutral-50 dark:bg-neutral-900", borderColor: "border-neutral-200 dark:border-neutral-800" },
  { id: "assigned", title: "Assigned", bgColor: "bg-blue-50 dark:bg-blue-900/10", borderColor: "border-blue-200 dark:border-blue-800" },
  { id: "running", title: "In Progress", bgColor: "bg-blue-50 dark:bg-blue-900/20", borderColor: "border-blue-300 dark:border-blue-700" },
  { id: "completed", title: "Done", bgColor: "bg-green-50 dark:bg-green-900/10", borderColor: "border-green-200 dark:border-green-800" },
  { id: "failed", title: "Failed", bgColor: "bg-red-50 dark:bg-red-900/10", borderColor: "border-red-200 dark:border-red-800" },
];

interface ProjectKanbanViewProps {
  tasks: OrchestrationTask[];
  onTaskStatusChange?: (taskId: string, newStatus: TaskStatus) => Promise<void>;
  onTaskClick?: (taskId: string) => void;
  loading?: boolean;
}

interface DragState {
  taskId: string;
  fromColumn: TaskStatus;
}

function TaskCard({
  task,
  onDragStart,
  onDragEnd,
  onClick,
  isDragging,
}: {
  task: OrchestrationTask;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onClick?: () => void;
  isDragging: boolean;
}) {
  const config = TASK_STATUS_CONFIG[task.status as TaskStatus];
  const isRunning = task.status === "running" || task.status === "assigned";

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={clsx(
        "group relative rounded-lg border bg-white p-3 shadow-sm transition-all cursor-grab active:cursor-grabbing dark:bg-neutral-800",
        isDragging ? "opacity-50 ring-2 ring-blue-500" : "hover:shadow-md",
        "border-neutral-200 dark:border-neutral-700"
      )}
    >
      {/* Drag handle */}
      <div className="absolute left-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
        <GripVertical className="size-4 text-neutral-400" />
      </div>

      {/* Running indicator */}
      {isRunning && (
        <div className="absolute -top-1 -right-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
          </span>
        </div>
      )}

      <div className="pl-3">
        {/* Task prompt */}
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 mb-2">
          {task.prompt.slice(0, 100)}{task.prompt.length > 100 ? "..." : ""}
        </p>

        {/* Footer */}
        <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
          <div className="flex items-center gap-2">
            {task.assignedAgentName && (
              <span className="flex items-center gap-1">
                <User className="size-3" />
                <span className="truncate max-w-[80px]">{task.assignedAgentName}</span>
              </span>
            )}
          </div>
          <span className={clsx("font-medium", config?.color)}>
            {config?.label ?? task.status}
          </span>
        </div>

        {/* Error indicator */}
        {task.errorMessage && (
          <div className="mt-2 rounded bg-red-50 dark:bg-red-900/20 px-2 py-1">
            <p className="text-xs text-red-600 dark:text-red-400 line-clamp-1">
              {task.errorMessage}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({
  column,
  tasks,
  onDragOver,
  onDrop,
  onTaskDragStart,
  onTaskDragEnd,
  onTaskClick,
  draggingTaskId,
  isDragOver,
}: {
  column: typeof KANBAN_COLUMNS[0];
  tasks: OrchestrationTask[];
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onTaskDragStart: (taskId: string, fromColumn: TaskStatus) => (e: React.DragEvent<HTMLDivElement>) => void;
  onTaskDragEnd: () => void;
  onTaskClick?: (taskId: string) => void;
  draggingTaskId: string | null;
  isDragOver: boolean;
}) {
  const config = TASK_STATUS_CONFIG[column.id];
  const Icon = config?.icon;

  return (
    <div
      className={clsx(
        "flex flex-col rounded-lg border min-w-[280px] max-w-[320px] flex-1 transition-all",
        column.bgColor,
        column.borderColor,
        isDragOver && "ring-2 ring-blue-500 ring-offset-2"
      )}
      onDragOver={onDragOver}
      onDrop={onDrop}
    >
      {/* Column header */}
      <div className="flex items-center justify-between border-b border-inherit px-4 py-3">
        <div className="flex items-center gap-2">
          {Icon && <Icon className={clsx("size-4", config?.color)} />}
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            {column.title}
          </h3>
          <span className="rounded-full bg-neutral-200 dark:bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {tasks.length}
          </span>
        </div>
        <button
          type="button"
          className="p-1 rounded hover:bg-neutral-200/50 dark:hover:bg-neutral-700/50 text-neutral-500"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      {/* Tasks list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-[200px]">
        {tasks.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-xs text-neutral-400 dark:text-neutral-500">
            No tasks
          </div>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task._id}
              task={task}
              onDragStart={onTaskDragStart(task._id, column.id)}
              onDragEnd={onTaskDragEnd}
              onClick={() => onTaskClick?.(task._id)}
              isDragging={draggingTaskId === task._id}
            />
          ))
        )}
      </div>
    </div>
  );
}

export function ProjectKanbanView({
  tasks,
  onTaskStatusChange,
  onTaskClick,
  loading,
}: ProjectKanbanViewProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<TaskStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Group tasks by status
  const tasksByStatus = useMemo(() => {
    const grouped: Record<TaskStatus, OrchestrationTask[]> = {
      pending: [],
      assigned: [],
      running: [],
      completed: [],
      failed: [],
      cancelled: [],
    };

    for (const task of tasks) {
      const status = task.status as TaskStatus;
      if (grouped[status]) {
        grouped[status].push(task);
      }
    }

    return grouped;
  }, [tasks]);

  const handleDragStart = useCallback(
    (taskId: string, fromColumn: TaskStatus) => (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", taskId);
      setDragState({ taskId, fromColumn });
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragState(null);
    setDragOverColumn(null);
  }, []);

  const handleDragOver = useCallback(
    (columnId: TaskStatus) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColumn(columnId);
    },
    []
  );

  const handleDrop = useCallback(
    (columnId: TaskStatus) => async (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      const taskId = e.dataTransfer.getData("text/plain");

      if (!dragState || dragState.fromColumn === columnId) {
        handleDragEnd();
        return;
      }

      if (onTaskStatusChange) {
        setIsUpdating(true);
        try {
          await onTaskStatusChange(taskId, columnId);
        } catch (error) {
          console.error("Failed to update task status:", error);
        } finally {
          setIsUpdating(false);
        }
      }

      handleDragEnd();
    },
    [dragState, onTaskStatusChange, handleDragEnd]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Updating overlay */}
      {isUpdating && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 dark:bg-neutral-900/50">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600 dark:border-neutral-600 dark:border-t-neutral-300" />
        </div>
      )}

      {/* Kanban board */}
      <div className="flex gap-4 overflow-x-auto pb-4">
        {KANBAN_COLUMNS.map((column) => (
          <KanbanColumn
            key={column.id}
            column={column}
            tasks={tasksByStatus[column.id] ?? []}
            onDragOver={handleDragOver(column.id)}
            onDrop={handleDrop(column.id)}
            onTaskDragStart={handleDragStart}
            onTaskDragEnd={handleDragEnd}
            onTaskClick={onTaskClick}
            draggingTaskId={dragState?.taskId ?? null}
            isDragOver={dragOverColumn === column.id && dragState?.fromColumn !== column.id}
          />
        ))}
      </div>
    </div>
  );
}
