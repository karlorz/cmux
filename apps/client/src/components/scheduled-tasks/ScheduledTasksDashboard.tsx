import { useState } from "react";
import { api } from "@cmux/convex/api";
import { useQuery, useMutation } from "convex/react";
import {
  Calendar,
  Clock,
  Play,
  Pause,
  Trash2,
  Plus,
  History,
  RefreshCw,
  Zap,
  Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CreateScheduledTaskDialog } from "./CreateScheduledTaskDialog";
import { EditScheduledTaskDialog } from "./EditScheduledTaskDialog";
import { ScheduledTaskRunHistory } from "./ScheduledTaskRunHistory";
import type { Doc, Id } from "@cmux/convex/dataModel";

interface ScheduledTasksDashboardProps {
  teamSlugOrId: string;
}

type ScheduledTask = Doc<"scheduledTasks">;

function formatSchedule(task: ScheduledTask): string {
  switch (task.scheduleType) {
    case "interval": {
      const minutes = task.intervalMinutes ?? 60;
      if (minutes < 60) return `Every ${minutes} minutes`;
      if (minutes === 60) return "Every hour";
      return `Every ${Math.round(minutes / 60)} hours`;
    }
    case "daily": {
      const hour = task.hourUTC ?? 9;
      const minute = task.minuteUTC ?? 0;
      return `Daily at ${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")} UTC`;
    }
    case "weekly": {
      const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const dayName = days[task.dayOfWeek ?? 1];
      const h = task.hourUTC ?? 9;
      const m = task.minuteUTC ?? 0;
      return `${dayName} at ${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")} UTC`;
    }
    case "cron":
      return task.cronExpression ?? "Custom cron";
    default:
      return "Unknown schedule";
  }
}

function formatNextRun(timestamp: number | undefined): string {
  if (!timestamp) return "Not scheduled";
  const date = new Date(timestamp);
  const now = new Date();
  const diff = timestamp - now.getTime();

  if (diff < 0) return "Overdue";
  if (diff < 60000) return "Less than a minute";
  if (diff < 3600000) return `In ${Math.round(diff / 60000)} minutes`;
  if (diff < 86400000) return `In ${Math.round(diff / 3600000)} hours`;
  return date.toLocaleDateString();
}

function StatusBadge({ status }: { status: ScheduledTask["status"] }) {
  const variants: Record<string, { label: string; className: string }> = {
    active: {
      label: "Active",
      className: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
    },
    paused: {
      label: "Paused",
      className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300",
    },
    disabled: {
      label: "Disabled",
      className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300",
    },
  };

  const variant = variants[status] ?? variants.disabled;

  return (
    <span className={cn("px-2 py-0.5 text-xs font-medium rounded-full", variant.className)}>
      {variant.label}
    </span>
  );
}

export function ScheduledTasksDashboard({ teamSlugOrId }: ScheduledTasksDashboardProps) {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<Id<"scheduledTasks"> | null>(null);
  const [editingTask, setEditingTask] = useState<ScheduledTask | null>(null);

  const tasks = useQuery(api.scheduledTasks.list, { teamSlugOrId });
  const isLoading = tasks === undefined;

  const pauseTask = useMutation(api.scheduledTasks.pause);
  const resumeTask = useMutation(api.scheduledTasks.resume);
  const removeTask = useMutation(api.scheduledTasks.remove);
  const triggerTask = useMutation(api.scheduledTasks.triggerNow);

  const handlePause = (scheduledTaskId: Id<"scheduledTasks">) => {
    pauseTask({ teamSlugOrId, scheduledTaskId });
  };

  const handleResume = (scheduledTaskId: Id<"scheduledTasks">) => {
    resumeTask({ teamSlugOrId, scheduledTaskId });
  };

  const handleTrigger = (scheduledTaskId: Id<"scheduledTasks">) => {
    triggerTask({ teamSlugOrId, scheduledTaskId });
  };

  const handleRemove = (scheduledTaskId: Id<"scheduledTasks">) => {
    if (confirm("Are you sure you want to delete this scheduled task?")) {
      removeTask({ teamSlugOrId, scheduledTaskId });
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-neutral-400" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Scheduled Tasks</h2>
          <p className="text-sm text-neutral-500">
            Recurring agent tasks that run on a schedule
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Task
        </Button>
      </div>

      {!tasks || tasks.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="w-12 h-12 mx-auto text-neutral-400 mb-4" />
            <h3 className="font-medium mb-2">No scheduled tasks</h3>
            <p className="text-sm text-neutral-500 mb-4">
              Create recurring tasks to automate agent work
            </p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create your first task
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {tasks.map((task) => (
            <Card key={task._id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      {task.name}
                      <StatusBadge status={task.status} />
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {task.agentName} • {task.repoFullName ?? "No repository"}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleTrigger(task._id)}
                      disabled={task.status === "disabled"}
                      title="Run now"
                    >
                      <Zap className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setEditingTask(task)}
                      title="Edit task"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setSelectedTaskId(task._id)}
                      title="View run history"
                    >
                      <History className="w-4 h-4" />
                    </Button>
                    {task.status === "active" ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handlePause(task._id)}
                        title="Pause"
                      >
                        <Pause className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleResume(task._id)}
                        title="Resume"
                      >
                        <Play className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      onClick={() => handleRemove(task._id)}
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-neutral-600 dark:text-neutral-400 mb-3 line-clamp-2">
                  {task.prompt}
                </div>
                <div className="flex items-center gap-4 text-xs text-neutral-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatSchedule(task)}
                  </span>
                  <span className="flex items-center gap-1">
                    <RefreshCw className="w-3 h-3" />
                    Next: {formatNextRun(task.nextRunAt)}
                  </span>
                  {(task.runCount ?? 0) > 0 && (
                    <span>
                      {task.lastRunStatus === "completed" ? "Last: success" : `Runs: ${task.runCount}`}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <CreateScheduledTaskDialog
        teamSlugOrId={teamSlugOrId}
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onCreated={() => {
          setShowCreateDialog(false);
        }}
      />

      {selectedTaskId && (
        <ScheduledTaskRunHistory
          teamSlugOrId={teamSlugOrId}
          scheduledTaskId={selectedTaskId}
          open={!!selectedTaskId}
          onOpenChange={(open) => !open && setSelectedTaskId(null)}
        />
      )}

      <EditScheduledTaskDialog
        teamSlugOrId={teamSlugOrId}
        task={editingTask}
        open={!!editingTask}
        onOpenChange={(open) => !open && setEditingTask(null)}
        onUpdated={() => setEditingTask(null)}
      />
    </div>
  );
}
