import { env } from "@/client-env";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExpandTasks } from "@/contexts/expand-tasks/ExpandTasksContext";
import { useSocket } from "@/contexts/socket/use-socket";
import { useTheme } from "@/components/theme/use-theme";
import { isElectron } from "@/lib/electron";
import { preloadTaskRunIframes } from "@/lib/preloadTaskRunIframes";
import {
  rewriteLocalWorkspaceUrlIfNeeded,
  toProxyWorkspaceUrl,
} from "@/lib/toProxyWorkspaceUrl";
import { useLocalVSCodeServeWebQuery } from "@/queries/local-vscode-serve-web";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import type {
  CreateLocalWorkspaceResponse,
  CreateCloudWorkspaceResponse,
  WorkspaceStartMode,
} from "@cmux/shared";
import {
  buildCreateCloudWorkspaceModeFields,
  getMirrorLocalUiState,
  WORKSPACE_START_MODE_LABELS,
  WORKSPACE_START_MODES,
} from "@cmux/shared";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { Cloud, Loader2, Monitor } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type WorkspaceCreationButtonsProps = {
  teamSlugOrId: string;
  selectedProject: string[];
  isEnvSelected: boolean;
  /** Resolved environment name from environments query (avoids parsing selectedProject) */
  selectedEnvironmentName?: string | null;
  /** Provider declared by the selected environment. */
  selectedEnvironmentProvider?: string | null;
};

export function WorkspaceCreationButtons({
  teamSlugOrId,
  selectedProject,
  isEnvSelected,
  selectedEnvironmentName,
  selectedEnvironmentProvider,
}: WorkspaceCreationButtonsProps) {
  const { socket } = useSocket();
  const { addTaskToExpand } = useExpandTasks();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const router = useRouter();
  const localServeWeb = useLocalVSCodeServeWebQuery();
  const [isCreatingLocal, setIsCreatingLocal] = useState(false);
  const [isCreatingCloud, setIsCreatingCloud] = useState(false);
  const [workspaceStartMode, setWorkspaceStartMode] =
    useState<WorkspaceStartMode>("default");
  const mirrorLocalUi = getMirrorLocalUiState({
    isElectron,
    provider: selectedEnvironmentProvider,
  });

  const reserveLocalWorkspace = useMutation(api.localWorkspaces.reserve);
  const createTask = useMutation(api.tasks.create);
  const failTaskRun = useMutation(api.taskRuns.fail);

  const handleCreateLocalWorkspace = useCallback(async () => {
    if (!socket) {
      toast.error("Socket not connected");
      return;
    }

    if (selectedProject.length === 0) {
      toast.error("Please select a repository first");
      return;
    }

    if (isEnvSelected) {
      toast.error("Local workspaces require a repository, not an environment");
      return;
    }

    const projectFullName = selectedProject[0];
    const repoUrl = `https://github.com/${projectFullName}.git`;

    setIsCreatingLocal(true);
    let reservedTaskRunId: Id<"taskRuns"> | null = null;

    try {
      const reservation = await reserveLocalWorkspace({
        teamSlugOrId,
        projectFullName,
        repoUrl,
      });

      if (!reservation) {
        throw new Error("Unable to reserve workspace name");
      }

      addTaskToExpand(reservation.taskId);
      reservedTaskRunId = reservation.taskRunId;

      await new Promise<void>((resolve) => {
        socket.emit(
          "create-local-workspace",
          {
            teamSlugOrId,
            projectFullName,
            repoUrl,
            taskId: reservation.taskId,
            taskRunId: reservation.taskRunId,
            workspaceName: reservation.workspaceName,
            descriptor: reservation.descriptor,
          },
          async (response: CreateLocalWorkspaceResponse) => {
            try {
              if (!response.success) {
                const message =
                  response.error ||
                  `Failed to create local workspace for ${projectFullName}`;
                if (reservedTaskRunId) {
                  await failTaskRun({
                    teamSlugOrId,
                    id: reservedTaskRunId,
                    errorMessage: message,
                  }).catch(() => undefined);
                }
                toast.error(message);
                return;
              }

              const effectiveTaskId = response.taskId ?? reservation.taskId;
              const effectiveTaskRunId =
                response.taskRunId ?? reservation.taskRunId;
              const normalizedWorkspaceUrl = response.workspaceUrl
                ? rewriteLocalWorkspaceUrlIfNeeded(
                    response.workspaceUrl,
                    localServeWeb.data?.baseUrl,
                  )
                : null;

              if (response.workspaceUrl && effectiveTaskRunId) {
                const proxiedUrl = toProxyWorkspaceUrl(
                  response.workspaceUrl,
                  localServeWeb.data?.baseUrl,
                );
                if (proxiedUrl) {
                  void preloadTaskRunIframes([
                    {
                      url: proxiedUrl,
                      taskRunId: effectiveTaskRunId,
                    },
                  ]).catch(() => undefined);
                }
              }

              toast.success(
                `Local workspace "${reservation.workspaceName}" created successfully`,
              );

              if (effectiveTaskId && effectiveTaskRunId) {
                void router
                  .preloadRoute({
                    to: "/$teamSlugOrId/task/$taskId/run/$runId/vscode",
                    params: {
                      teamSlugOrId,
                      taskId: effectiveTaskId,
                      runId: effectiveTaskRunId,
                    },
                  })
                  .catch(() => undefined);
                void navigate({
                  to: "/$teamSlugOrId/task/$taskId/run/$runId/vscode",
                  params: {
                    teamSlugOrId,
                    taskId: effectiveTaskId,
                    runId: effectiveTaskRunId,
                  },
                });
              } else if (normalizedWorkspaceUrl) {
                window.location.assign(normalizedWorkspaceUrl);
              }
            } catch (callbackError) {
              console.error("Error creating local workspace:", callbackError);
              toast.error("Failed to create local workspace");
            } finally {
              resolve();
            }
          },
        );
      });
    } catch (error) {
      console.error("Error creating local workspace:", error);
      toast.error("Failed to create local workspace");
    } finally {
      setIsCreatingLocal(false);
    }
  }, [
    socket,
    selectedProject,
    isEnvSelected,
    teamSlugOrId,
    reserveLocalWorkspace,
    addTaskToExpand,
    failTaskRun,
    localServeWeb.data?.baseUrl,
    navigate,
    router,
  ]);

  const handleCreateCloudWorkspace = useCallback(async () => {
    if (!socket) {
      toast.error("Socket not connected");
      return;
    }

    if (selectedProject.length === 0) {
      toast.error("Please select an environment first");
      return;
    }

    if (!isEnvSelected) {
      toast.error("Cloud workspaces require an environment, not a repository");
      return;
    }

    const projectFullName = selectedProject[0];
    const environmentId = projectFullName.replace(
      /^env:/,
      "",
    ) as Id<"environments">;

    // Use resolved environment name from props (falls back to "Unknown Environment" if unavailable)
    const environmentName = selectedEnvironmentName || "Unknown Environment";

    if (workspaceStartMode === "mirror-local" && !mirrorLocalUi.enabled) {
      toast.error(
        mirrorLocalUi.tooltip ??
          "Mirror local requires the Electron desktop app.",
      );
      return;
    }

    setIsCreatingCloud(true);

    try {
      // Create task in Convex with environment name
      const { taskId } = await createTask({
        teamSlugOrId,
        text: environmentName,
        projectFullName: undefined, // No repo for cloud environment workspaces
        baseBranch: undefined, // No branch for environments
        environmentId,
        isCloudWorkspace: true,
      });

      // Hint the sidebar to auto-expand this task once it appears
      addTaskToExpand(taskId);

      const modeFields =
        buildCreateCloudWorkspaceModeFields(workspaceStartMode);

      await new Promise<void>((resolve) => {
        socket.emit(
          "create-cloud-workspace",
          {
            teamSlugOrId,
            environmentId,
            taskId,
            theme,
            ...modeFields,
          },
          async (response: CreateCloudWorkspaceResponse) => {
            try {
              if (!response.success) {
                toast.error(
                  response.error || "Failed to create cloud workspace",
                );
                return;
              }

              const effectiveTaskId = response.taskId ?? taskId;
              const effectiveTaskRunId = response.taskRunId;

              if (workspaceStartMode === "clean") {
                toast.success("Clean cloud workspace created successfully");
              } else if (workspaceStartMode === "default") {
                toast.success("Cloud workspace created successfully");
              }

              if (effectiveTaskId && effectiveTaskRunId) {
                void router
                  .preloadRoute({
                    to: "/$teamSlugOrId/task/$taskId/run/$runId/vscode",
                    params: {
                      teamSlugOrId,
                      taskId: effectiveTaskId,
                      runId: effectiveTaskRunId,
                    },
                  })
                  .catch(() => undefined);
                void navigate({
                  to: "/$teamSlugOrId/task/$taskId/run/$runId/vscode",
                  params: {
                    teamSlugOrId,
                    taskId: effectiveTaskId,
                    runId: effectiveTaskRunId,
                  },
                });
              }
            } catch (callbackError) {
              console.error("Error creating cloud workspace:", callbackError);
              toast.error("Failed to create cloud workspace");
            } finally {
              resolve();
            }
          },
        );
      });

      console.log("Cloud workspace created:", taskId, workspaceStartMode);
    } catch (error) {
      console.error("Error creating cloud workspace:", error);
      toast.error("Failed to create cloud workspace");
    } finally {
      setIsCreatingCloud(false);
    }
  }, [
    socket,
    selectedProject,
    isEnvSelected,
    selectedEnvironmentName,
    teamSlugOrId,
    createTask,
    addTaskToExpand,
    theme,
    navigate,
    router,
    workspaceStartMode,
    mirrorLocalUi.enabled,
    mirrorLocalUi.tooltip,
  ]);

  const canCreateLocal = selectedProject.length > 0 && !isEnvSelected;
  const canCreateCloud = selectedProject.length > 0 && isEnvSelected;

  const SHOW_WORKSPACE_BUTTONS = true;

  if (!SHOW_WORKSPACE_BUTTONS) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 mb-3">
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="dashboard-workspace-start-mode"
        role="group"
        aria-label="Cloud workspace start mode"
      >
        <span className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          Start mode
        </span>
        <div className="flex flex-wrap gap-1">
          {WORKSPACE_START_MODES.map((mode) => {
            const isMirror = mode === "mirror-local";
            const disabled = isMirror && !mirrorLocalUi.enabled;
            const selected = workspaceStartMode === mode;
            return (
              <button
                key={mode}
                type="button"
                disabled={disabled}
                title={
                  isMirror && mirrorLocalUi.tooltip
                    ? mirrorLocalUi.tooltip
                    : undefined
                }
                data-testid={`dashboard-workspace-start-mode-${mode}`}
                aria-pressed={selected}
                onClick={() => {
                  if (disabled) return;
                  setWorkspaceStartMode(mode);
                }}
                className={[
                  "rounded-md border px-2 py-1 text-[11px] font-medium transition",
                  selected
                    ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                    : "border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700",
                  disabled
                    ? "opacity-50 cursor-not-allowed hover:bg-transparent"
                    : "",
                ].join(" ")}
              >
                {WORKSPACE_START_MODE_LABELS[mode]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        {!env.NEXT_PUBLIC_WEB_MODE && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleCreateLocalWorkspace}
                disabled={!canCreateLocal || isCreatingLocal}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCreatingLocal ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Monitor className="w-3.5 h-3.5" />
                )}
                <span>Create Local Workspace</span>
              </button>
            </TooltipTrigger>
            <TooltipContent>
              {!selectedProject.length
                ? "Select a repository first"
                : isEnvSelected
                  ? "Switch to repository mode (not environment)"
                  : "Create workspace from selected repository"}
            </TooltipContent>
          </Tooltip>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={handleCreateCloudWorkspace}
              disabled={!canCreateCloud || isCreatingCloud}
              data-testid="dashboard-create-cloud-workspace"
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreatingCloud ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Cloud className="w-4 h-4" />
              )}
              <span>Create Cloud Workspace</span>
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {!selectedProject.length
              ? "Select an environment first"
              : !isEnvSelected
                ? "Switch to environment mode (not repository)"
                : workspaceStartMode === "clean"
                  ? "Create clean workspace (skip provider auth injection)"
                  : workspaceStartMode === "mirror-local"
                    ? "Create a clean PVE LXC workspace and apply this host's safe agent configuration pack"
                    : "Create workspace from selected environment"}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
