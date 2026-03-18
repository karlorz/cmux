import { useState } from "react";
import { Clock, User, Bot, Wrench, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { STATUS_CONFIG, type TaskStatus } from "./status-config";
import type { OrchestrationTaskWithDeps } from "./OrchestrationDashboard";

interface OrchestrationTaskDetailProps {
  task: OrchestrationTaskWithDeps;
  teamSlugOrId: string;
}

type SurfaceTab = "operator" | "supervisor" | "worker";

/**
 * 3-Surface Task Detail View
 *
 * Inspired by TaskCaptain's separation of concerns:
 * - Operator Brief: The human request and context
 * - Supervisor View: Head agent planning and delegation decisions
 * - Worker View: Sub-agent execution details and artifacts
 */
export function OrchestrationTaskDetail({ task, teamSlugOrId }: OrchestrationTaskDetailProps) {
  const [activeTab, setActiveTab] = useState<SurfaceTab>("operator");
  const [collapsed, setCollapsed] = useState(false);

  const status = task.status as TaskStatus;
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const tabs: { id: SurfaceTab; label: string; icon: typeof User }[] = [
    { id: "operator", label: "Operator Brief", icon: User },
    { id: "supervisor", label: "Supervisor", icon: Bot },
    { id: "worker", label: "Worker", icon: Wrench },
  ];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium",
              config.bgColor
            )}
          >
            <Icon
              className={clsx(
                "size-3",
                config.color,
                status === "running" && "animate-spin"
              )}
            />
            <span className={config.color}>{config.label}</span>
          </span>
          {task.assignedAgentName && (
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {task.assignedAgentName}
            </span>
          )}
          <span className="text-xs text-neutral-400">
            P{task.priority}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Tab Navigation */}
          <div className="flex border-b border-neutral-200 dark:border-neutral-800">
            {tabs.map((tab) => {
              const TabIcon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors",
                    activeTab === tab.id
                      ? "border-b-2 border-blue-500 text-blue-600 dark:text-blue-400"
                      : "text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  )}
                >
                  <TabIcon className="size-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="p-4">
            {activeTab === "operator" && (
              <OperatorBrief task={task} />
            )}
            {activeTab === "supervisor" && (
              <SupervisorView task={task} />
            )}
            {activeTab === "worker" && (
              <WorkerView task={task} teamSlugOrId={teamSlugOrId} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Operator Brief Surface
 * Shows the human request: original prompt, context, and any user messages
 */
function OperatorBrief({ task }: { task: OrchestrationTaskWithDeps }) {
  const createdAt = new Date(task.createdAt).toLocaleString();

  return (
    <div className="space-y-4">
      {/* Original Request */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Original Request
        </div>
        <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
          {task.prompt}
        </div>
      </div>

      {/* Context / Metadata */}
      {task.metadata && Object.keys(task.metadata).length > 0 && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Context
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
            <dl className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(task.metadata).map(([key, value]) => (
                <div key={key}>
                  <dt className="text-neutral-500">{key}</dt>
                  <dd className="text-neutral-700 dark:text-neutral-300">
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="flex items-center gap-1 text-xs text-neutral-400">
        <Clock className="size-3" />
        Submitted {createdAt}
      </div>
    </div>
  );
}

/**
 * Supervisor View Surface
 * Shows head agent reasoning: planning decisions, delegation rationale, status updates
 */
function SupervisorView({ task }: { task: OrchestrationTaskWithDeps }) {
  const hasDependencies = task.dependencyInfo && task.dependencyInfo.totalDeps > 0;

  return (
    <div className="space-y-4">
      {/* Delegation Decision */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Delegation
        </div>
        <div className="rounded-lg bg-blue-50 p-3 text-sm dark:bg-blue-900/20">
          {task.assignedAgentName ? (
            <div className="flex items-center gap-2">
              <Bot className="size-4 text-blue-600 dark:text-blue-400" />
              <span className="text-blue-700 dark:text-blue-300">
                Assigned to <strong>{task.assignedAgentName}</strong>
              </span>
            </div>
          ) : (
            <span className="text-neutral-500 dark:text-neutral-400">
              Not yet assigned to an agent
            </span>
          )}
        </div>
      </div>

      {/* Dependencies */}
      {hasDependencies && task.dependencyInfo && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Dependency Chain
          </div>
          <div className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/20">
            <div className="mb-2 text-sm text-amber-700 dark:text-amber-300">
              {task.dependencyInfo.completedDeps} of {task.dependencyInfo.totalDeps} dependencies complete
            </div>
            {task.dependencyInfo.blockedBy && task.dependencyInfo.blockedBy.length > 0 && (
              <ul className="space-y-1 text-xs">
                {task.dependencyInfo.blockedBy.map((dep) => (
                  <li key={dep._id} className="flex items-center gap-2">
                    <span className={clsx(
                      "rounded px-1 py-0.5",
                      dep.status === "completed"
                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                    )}>
                      {dep.status}
                    </span>
                    <span className="text-neutral-600 dark:text-neutral-400 truncate">
                      {dep.prompt}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Planning Notes (from metadata if available) */}
      {task.metadata?.planningNotes && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Planning Notes
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300">
            {String(task.metadata.planningNotes)}
          </div>
        </div>
      )}

      {/* Status Timeline */}
      <div>
        <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          Status Timeline
        </div>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-20 text-neutral-500">Created</span>
            <span className="text-neutral-700 dark:text-neutral-300">
              {new Date(task.createdAt).toLocaleString()}
            </span>
          </div>
          {task.assignedAt && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-neutral-500">Assigned</span>
              <span className="text-neutral-700 dark:text-neutral-300">
                {new Date(task.assignedAt).toLocaleString()}
              </span>
            </div>
          )}
          {task.startedAt && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-neutral-500">Started</span>
              <span className="text-neutral-700 dark:text-neutral-300">
                {new Date(task.startedAt).toLocaleString()}
              </span>
            </div>
          )}
          {task.completedAt && (
            <div className="flex items-center gap-2">
              <span className="w-20 text-neutral-500">Completed</span>
              <span className="text-neutral-700 dark:text-neutral-300">
                {new Date(task.completedAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Worker View Surface
 * Shows sub-agent execution: task run details, output, artifacts, PRs
 */
function WorkerView({ task, teamSlugOrId }: { task: OrchestrationTaskWithDeps; teamSlugOrId: string }) {
  const status = task.status as TaskStatus;

  return (
    <div className="space-y-4">
      {/* Task Run Link */}
      {task.taskRunId && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Task Run
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 dark:bg-neutral-800">
            <a
              href={`/${teamSlugOrId}/tasks/${task.taskId}`}
              className="text-sm text-blue-600 hover:underline dark:text-blue-400"
            >
              View task run {String(task.taskRunId).slice(0, 12)}...
            </a>
          </div>
        </div>
      )}

      {/* Result (if completed) */}
      {status === "completed" && task.result && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Result
          </div>
          <div className="rounded-lg bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
            {task.result}
          </div>
        </div>
      )}

      {/* Error (if failed) */}
      {status === "failed" && task.errorMessage && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Error
          </div>
          <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
            {task.errorMessage}
          </div>
        </div>
      )}

      {/* Sandbox Info */}
      {task.assignedSandboxId && (
        <div>
          <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Sandbox
          </div>
          <div className="rounded-lg bg-neutral-50 p-3 text-xs font-mono text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
            {task.assignedSandboxId}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!task.taskRunId && !task.result && !task.errorMessage && (
        <div className="py-8 text-center text-sm text-neutral-400">
          {status === "pending" || status === "assigned"
            ? "Waiting for execution to begin..."
            : "No execution details available"}
        </div>
      )}
    </div>
  );
}
