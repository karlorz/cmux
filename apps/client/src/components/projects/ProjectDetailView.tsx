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
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import {
  getApiIntegrationsGithubProjectsItems,
} from "@cmux/www-openapi-client";
import type { ProjectItem } from "@cmux/www-openapi-client";
import {
  ArrowLeft,
  Play,
  ListTodo,
  Loader2,
} from "lucide-react";
import clsx from "clsx";

import { Button } from "@/components/ui/button";
import { STATUS_CONFIG as TASK_STATUS_CONFIG } from "@/components/orchestration/status-config";
import type { TaskStatus } from "@/components/orchestration/status-config";
import { api } from "@cmux/convex/api";
import { PROJECT_STATUS_CONFIG } from "./project-status-config";
import { ProjectProgress, ProjectProgressBar } from "./ProjectProgress";
import { PlanEditor } from "./PlanEditor";
import { DispatchPlanDialog } from "./DispatchPlanDialog";
import { MilestoneEditor, type Milestone } from "./MilestoneEditor";
import { GitHubProjectLink } from "./GitHubProjectLink";
import type { Plan, PlanTask } from "./PlanEditor";
import type { Doc } from "@cmux/convex/dataModel";

type OrchestrationTask = Doc<"orchestrationTasks">;
const DEFAULT_IMPORTED_PLAN_AGENT = "claude/opus-4.5";

function mapGitHubStatusToPlanStatus(
  statusValue: unknown,
): string {
  if (typeof statusValue !== "string") {
    return "pending";
  }

  const normalizedStatus = statusValue.trim().toLowerCase();
  if (
    normalizedStatus === "in progress" ||
    normalizedStatus === "review" ||
    normalizedStatus === "in review"
  ) {
    return "running";
  }
  if (
    normalizedStatus === "done" ||
    normalizedStatus === "merged" ||
    normalizedStatus === "closed"
  ) {
    return "completed";
  }

  return "pending";
}

function buildPlanPromptFromGitHubItem(item: ProjectItem): string {
  const title = item.content?.title?.trim() || "(untitled GitHub item)";
  const body =
    typeof item.content?.body === "string" ? item.content.body.trim() : "";

  return body ? `${title}\n\n${body}` : title;
}

interface ProjectDetailViewProps {
  project: Doc<"projects">;
  orchTasks: OrchestrationTask[];
  teamSlugOrId: string;
  onSavePlan: (plan: Plan) => Promise<void>;
  onDispatchComplete?: () => void;
  onProjectRefresh?: () => void;
  milestones?: Milestone[];
  onAddMilestone?: (milestone: Omit<Milestone, "id">) => Promise<void>;
  onUpdateMilestone?: (id: string, updates: Partial<Milestone>) => Promise<void>;
  onDeleteMilestone?: (id: string) => Promise<void>;
}

function OrchTaskStatusIcon({ status }: { status: string }) {
  const config = TASK_STATUS_CONFIG[status as TaskStatus];
  if (!config) {
    const fallback = TASK_STATUS_CONFIG.pending;
    const Icon = fallback.icon;
    return <Icon className={clsx("size-4", fallback.color)} />;
  }
  const Icon = config.icon;
  return (
    <Icon
      className={clsx(
        "size-4",
        config.color,
        (status === "running" || status === "assigned") && "animate-spin",
      )}
    />
  );
}

export function ProjectDetailView({
  project,
  orchTasks,
  teamSlugOrId,
  onSavePlan,
  onDispatchComplete,
  onProjectRefresh,
  milestones = [],
  onAddMilestone,
  onUpdateMilestone,
  onDeleteMilestone,
}: ProjectDetailViewProps) {
  const [showDispatchDialog, setShowDispatchDialog] = useState(false);
  const { data: connections } = useQuery(
    convexQuery(api.github.listProviderConnections, { teamSlugOrId }),
  );

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

  // Progress metrics - merge cmux tasks + GitHub items
  const cmuxTotalTasks = project.totalTasks ?? 0;
  const cmuxCompletedTasks = project.completedTasks ?? 0;
  const cmuxFailedTasks = project.failedTasks ?? 0;
  const cmuxRunningTasks = project.runningTasks ?? orchTasks.filter(
    (t) => t.status === "running" || t.status === "assigned"
  ).length;

  // GitHub cached item counts
  const ghTotal = project.githubItemsTotal ?? 0;
  const ghDone = project.githubItemsDone ?? 0;
  const ghInProgress = project.githubItemsInProgress ?? 0;
  const hasLinkedGitHubItems = ghTotal > 0;
  const matchingGitHubConnection = useMemo(() => {
    const activeConnections =
      connections?.filter((connection) => connection.isActive) ?? [];
    const normalizedOwner = project.githubProjectOwner?.toLowerCase();

    if (!normalizedOwner) {
      return activeConnections[0];
    }

    return (
      activeConnections.find(
        (connection) =>
          connection.accountLogin?.toLowerCase() === normalizedOwner,
      ) ?? activeConnections[0]
    );
  }, [connections, project.githubProjectOwner]);
  const linkedGitHubItemsSearch = useMemo(() => {
    if (!project.githubProjectId || !matchingGitHubConnection) {
      return null;
    }

    const owner =
      project.githubProjectOwner ?? matchingGitHubConnection.accountLogin;
    const ownerType =
      project.githubProjectOwnerType ??
      (matchingGitHubConnection.accountType === "Organization"
        ? "organization"
        : "user");

    if (!owner) {
      return null;
    }

    return {
      installationId: matchingGitHubConnection.installationId,
      owner,
      ownerType,
      ...(project.githubProjectUrl
        ? { projectUrl: project.githubProjectUrl }
        : {}),
    } as const;
  }, [
    matchingGitHubConnection,
    project.githubProjectId,
    project.githubProjectOwner,
    project.githubProjectOwnerType,
    project.githubProjectUrl,
  ]);
  const shouldSeedPlanFromLinkedGitHubItems =
    !isDispatched &&
    (plan?.tasks.length ?? 0) === 0 &&
    hasLinkedGitHubItems &&
    Boolean(project.githubProjectId) &&
    Boolean(matchingGitHubConnection);
  const {
    data: linkedGitHubItems = [],
    isLoading: linkedGitHubItemsLoading,
  } = useQuery({
    queryKey: [
      "project-detail-linked-github-items",
      teamSlugOrId,
      matchingGitHubConnection?.installationId,
      project.githubProjectId,
    ],
    queryFn: async () => {
      const installationId = matchingGitHubConnection?.installationId;
      const githubProjectId = project.githubProjectId;
      if (!installationId || !githubProjectId) {
        return [];
      }

      const collectedItems: ProjectItem[] = [];
      let cursor: string | undefined;

      while (true) {
        const res = await getApiIntegrationsGithubProjectsItems({
          query: {
            team: teamSlugOrId,
            installationId,
            projectId: githubProjectId,
            first: 50,
            ...(cursor ? { after: cursor } : {}),
          },
        });
        const data = res.data;
        if (!data) {
          break;
        }

        collectedItems.push(...data.items);
        if (!data.pageInfo.hasNextPage || !data.pageInfo.endCursor) {
          break;
        }

        cursor = data.pageInfo.endCursor;
      }

      return collectedItems;
    },
    enabled: shouldSeedPlanFromLinkedGitHubItems,
  });
  const seededPlanTasks = useMemo<PlanTask[]>(() => {
    const defaultAgent = plan?.headAgent ?? DEFAULT_IMPORTED_PLAN_AGENT;

    return linkedGitHubItems.map((item) => ({
      id: `github_item_${item.id}`,
      prompt: buildPlanPromptFromGitHubItem(item),
      agentName: defaultAgent,
      status: mapGitHubStatusToPlanStatus(item.fieldValues.Status),
      priority: 5,
    }));
  }, [linkedGitHubItems, plan?.headAgent]);
  const seededPlan = useMemo<Plan | undefined>(() => {
    if (seededPlanTasks.length === 0) {
      return undefined;
    }

    return {
      orchestrationId:
        plan?.orchestrationId ??
        `github_project_${project.githubProjectId ?? project._id}`,
      headAgent: plan?.headAgent ?? DEFAULT_IMPORTED_PLAN_AGENT,
      description: plan?.description ?? project.description ?? "",
      tasks: seededPlanTasks,
    };
  }, [
    plan?.description,
    plan?.headAgent,
    plan?.orchestrationId,
    project._id,
    project.description,
    project.githubProjectId,
    seededPlanTasks,
  ]);
  const effectivePlan = plan?.tasks.length ? plan : seededPlan;
  const planEditorKey = useMemo(() => {
    const savedPlanUpdatedAt =
      typeof project.plan?.updatedAt === "string"
        ? project.plan.updatedAt
        : null;
    if (savedPlanUpdatedAt) {
      return `saved:${project._id}:${savedPlanUpdatedAt}`;
    }
    if (seededPlanTasks.length > 0) {
      return `seeded:${project._id}:${seededPlanTasks.map((task) => task.id).join(",")}`;
    }
    return `empty:${project._id}`;
  }, [project._id, project.plan?.updatedAt, seededPlanTasks]);
  const showLinkedItemsLoadingState =
    shouldSeedPlanFromLinkedGitHubItems &&
    linkedGitHubItemsLoading &&
    seededPlanTasks.length === 0;
  const showLinkedItemsFallbackEmptyState =
    shouldSeedPlanFromLinkedGitHubItems &&
    !linkedGitHubItemsLoading &&
    seededPlanTasks.length === 0;

  // Merged totals for progress display
  const totalTasks = cmuxTotalTasks + ghTotal;
  const completedTasks = cmuxCompletedTasks + ghDone;
  const runningTasks = cmuxRunningTasks + ghInProgress;
  const failedTasks = cmuxFailedTasks; // GitHub doesn't have failed state
  const pendingTasks = totalTasks - completedTasks - failedTasks - runningTasks;
  const progressPercent = totalTasks > 0
    ? Math.round((completedTasks / totalTasks) * 100)
    : 0;

  // Show split if both sources have items
  const showSplit = cmuxTotalTasks > 0 && ghTotal > 0;

  const statusConfig = PROJECT_STATUS_CONFIG[project.status] ?? PROJECT_STATUS_CONFIG.planning;

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

      {/* GitHub Project Link */}
      <GitHubProjectLink
        project={project}
        teamSlugOrId={teamSlugOrId}
        onLinked={onProjectRefresh}
      />

      {/* Progress */}
      {totalTasks > 0 && (
        <div className="space-y-2">
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
          {showSplit && (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {cmuxTotalTasks} agent task{cmuxTotalTasks === 1 ? "" : "s"} + {ghTotal} GitHub item{ghTotal === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      {/* Plan Editor */}
      {seededPlanTasks.length > 0 && (plan?.tasks.length ?? 0) === 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          Linked GitHub items were loaded into the plan editor as draft tasks.
          Review or edit them, then click <span className="font-medium">Save</span>{" "}
          when you want to adopt them as the cmux plan.
        </div>
      )}
      <PlanEditor
        key={planEditorKey}
        plan={effectivePlan}
        onSave={isDispatched ? undefined : onSavePlan}
        readOnly={isDispatched}
        taskStatuses={taskStatuses}
        taskCountOverride={
          showLinkedItemsLoadingState || showLinkedItemsFallbackEmptyState
            ? ghTotal
            : undefined
        }
        emptyStateSupplement={
          showLinkedItemsLoadingState ? (
            <div className="mt-6 w-full max-w-md rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-950">
              <p className="flex items-center justify-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                <Loader2 className="size-4 animate-spin" />
                Loading {ghTotal} linked GitHub item{ghTotal === 1 ? "" : "s"} into the draft plan...
              </p>
            </div>
          ) : showLinkedItemsFallbackEmptyState ? (
            <div className="mt-6 w-full max-w-md rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-center dark:border-neutral-800 dark:bg-neutral-950">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                This project already tracks {ghTotal} linked GitHub item
                {ghTotal === 1 ? "" : "s"}.
              </p>
              <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
                Use the linked board items here, or add local plan tasks if you
                want a separate cmux orchestration plan.
              </p>
              {project.githubProjectId && linkedGitHubItemsSearch && (
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link
                    to="/$teamSlugOrId/projects/$projectId"
                    params={{
                      teamSlugOrId,
                      projectId: project.githubProjectId,
                    }}
                    search={linkedGitHubItemsSearch}
                  >
                    <ListTodo className="size-4 mr-2" />
                    View Linked GitHub Items
                  </Link>
                </Button>
              )}
            </div>
          ) : undefined
        }
        className="min-h-[300px]"
      />

      {/* Milestones Section */}
      <div className="rounded-lg border border-neutral-200 dark:border-neutral-800 p-4">
        <MilestoneEditor
          milestones={milestones}
          onAdd={onAddMilestone}
          onUpdate={onUpdateMilestone}
          onDelete={onDeleteMilestone}
          readOnly={!onAddMilestone}
        />
      </div>

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
