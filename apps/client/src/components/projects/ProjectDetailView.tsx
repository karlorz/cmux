/**
 * ProjectDetailView Component
 *
 * Full project detail layout with:
 * - Header (project name, status, description, back button)
 * - Progress indicators
 * - PlanEditor (editable before dispatch, readOnly after)
 * - Dispatch button
 * - Live orchestration task list
 */

import { useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
} from "lucide-react";
import clsx from "clsx";

import { Button } from "@/components/ui/button";
import { ProjectProgress, ProjectProgressBar } from "./ProjectProgress";
import { PlanEditor } from "./PlanEditor";
import { DispatchPlanDialog } from "./DispatchPlanDialog";
import type { Plan } from "./PlanEditor";
import type { Doc } from "@cmux/convex/dataModel";

type OrchestrationTask = Doc<"orchestrationTasks">;

interface ProjectDetailViewProps {
  project: Doc<"projects">;
  orchTasks: OrchestrationTask[];
  teamSlugOrId: string;
  onSavePlan: (plan: Plan) => Promise<void>;
  onDispatchComplete?: () => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string }> = {
  planning: {
    label: "Planning",
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  active: {
    label: "Active",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  paused: {
    label: "Paused",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  completed: {
    label: "Completed",
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  archived: {
    label: "Archived",
    color: "text-neutral-600 dark:text-neutral-400",
    bgColor: "bg-neutral-100 dark:bg-neutral-900/30",
  },
};

function OrchTaskStatusIcon({ status }: { status: string }) {
  switch (status) {
    case "completed":
      return <CheckCircle2 className="size-4 text-green-500" />;
    case "running":
    case "assigned":
      return <Loader2 className="size-4 text-blue-500 animate-spin" />;
    case "failed":
      return <XCircle className="size-4 text-red-500" />;
    default:
      return <Clock className="size-4 text-amber-500" />;
  }
}

export function ProjectDetailView({
  project,
  orchTasks,
  teamSlugOrId,
  onSavePlan,
  onDispatchComplete,
}: ProjectDetailViewProps) {
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);

  const plan = project.plan as Plan | undefined;
  const isDispatched = orchTasks.length > 0;

  // Build task status map for PlanEditor overlay
  const taskStatuses = useMemo(() => {
    if (!plan?.tasks || orchTasks.length === 0) return undefined;

    const statusMap = new Map<string, { status: string; result?: string; errorMessage?: string }>();

    // Map orchestrationTaskId -> orchTask data
    const orchTaskMap = new Map<string, OrchestrationTask>();
    for (const ot of orchTasks) {
      orchTaskMap.set(ot._id, ot);
    }

    for (const planTask of plan.tasks) {
      if (planTask.orchestrationTaskId) {
        const ot = orchTaskMap.get(planTask.orchestrationTaskId);
        if (ot) {
          statusMap.set(planTask.id, {
            status: ot.status,
            result: ot.result,
            errorMessage: ot.errorMessage,
          });
        }
      }
    }

    return statusMap.size > 0 ? statusMap : undefined;
  }, [plan?.tasks, orchTasks]);

  // Progress metrics
  const totalTasks = project.totalTasks ?? 0;
  const completedTasks = project.completedTasks ?? 0;
  const failedTasks = project.failedTasks ?? 0;
  const runningTasks = project.runningTasks ?? orchTasks.filter(
    (t) => t.status === "running" || t.status === "assigned"
  ).length;
  const pendingTasks = totalTasks - completedTasks - failedTasks - runningTasks;
  const progressPercent = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  const statusConfig = STATUS_CONFIG[project.status] ?? STATUS_CONFIG.planning;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/$teamSlugOrId/projects/dashboard"
              params={{ teamSlugOrId }}
            >
              <ArrowLeft className="size-4 mr-1" />
              Back
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                {project.name}
              </h1>
              <span className={clsx(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                statusConfig.bgColor,
                statusConfig.color,
              )}>
                {statusConfig.label}
              </span>
            </div>
            {project.description && (
              <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
                {project.description}
              </p>
            )}
          </div>
        </div>

        {/* Dispatch button */}
        {plan && plan.tasks.length > 0 && !isDispatched && (
          <Button onClick={() => setShowDispatchDialog(true)}>
            <Play className="size-4 mr-2" />
            Dispatch Plan
          </Button>
        )}
      </div>

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="flex items-center gap-6">
          <ProjectProgress
            total={totalTasks}
            completed={completedTasks}
            running={runningTasks}
            failed={failedTasks}
            pending={pendingTasks}
            progressPercent={progressPercent}
            size="sm"
          />
          <div className="flex-1">
            <ProjectProgressBar
              completed={completedTasks}
              running={runningTasks}
              failed={failedTasks}
              pending={pendingTasks}
              total={totalTasks}
            />
          </div>
        </div>
      )}

      {/* Plan Editor */}
      <PlanEditor
        plan={plan}
        onSave={isDispatched ? undefined : onSavePlan}
        readOnly={isDispatched}
        taskStatuses={taskStatuses}
        className="min-h-[300px]"
      />

      {/* Live task list (after dispatch) */}
      {orchTasks.length > 0 && (
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-800">
          <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
            <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
              Orchestration Tasks
            </h3>
          </div>
          <div className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {orchTasks.map((task) => (
              <div key={task._id} className="flex items-center gap-3 px-4 py-3">
                <OrchTaskStatusIcon status={task.status} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-neutral-900 dark:text-neutral-100 truncate">
                    {task.prompt.slice(0, 120)}
                    {task.prompt.length > 120 ? "..." : ""}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {task.assignedAgentName && (
                      <span className="text-xs font-mono text-neutral-500">
                        {task.assignedAgentName}
                      </span>
                    )}
                    <span className="text-xs text-neutral-400">
                      {task.status}
                    </span>
                  </div>
                </div>
                {task.errorMessage && (
                  <span className="text-xs text-red-500 max-w-[200px] truncate">
                    {task.errorMessage}
                  </span>
                )}
                {task.result && (
                  <span className="text-xs text-green-600 dark:text-green-400 max-w-[200px] truncate">
                    {task.result}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispatch Dialog */}
      {plan && (
        <DispatchPlanDialog
          open={showDispatchDialog}
          onOpenChange={setShowDispatchDialog}
          projectId={project._id}
          projectName={project.name}
          tasks={plan.tasks}
          onDispatched={onDispatchComplete}
        />
      )}
    </div>
  );
}
