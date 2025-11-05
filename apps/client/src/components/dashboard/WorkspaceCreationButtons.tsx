import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useExpandTasks } from "@/contexts/expand-tasks/ExpandTasksContext";
import { useSocket } from "@/contexts/socket/use-socket";
import { useTheme } from "@/components/theme/use-theme";
import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import type {
  CreateLocalWorkspaceResponse,
  CreateCloudWorkspaceResponse,
  CreateCloudRepositoryWorkspaceResponse,
} from "@cmux/shared";
import { useMutation } from "convex/react";
import { Server as ServerIcon, FolderOpen, Loader2, Cloud } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

type WorkspaceCreationButtonsProps = {
  teamSlugOrId: string;
  selectedProject: string[];
  isEnvSelected: boolean;
  isCloudRepoSelected?: boolean;
};

export function WorkspaceCreationButtons({
  teamSlugOrId,
  selectedProject,
  isEnvSelected,
  isCloudRepoSelected = false,
}: WorkspaceCreationButtonsProps) {
  const { socket } = useSocket();
  const { addTaskToExpand } = useExpandTasks();
  const { theme } = useTheme();
  const [isCreatingLocal, setIsCreatingLocal] = useState(false);
  const [isCreatingCloud, setIsCreatingCloud] = useState(false);
  const [isCreatingCloudRepo, setIsCreatingCloudRepo] = useState(false);

  const reserveLocalWorkspace = useMutation(api.localWorkspaces.reserve);
  const createTask = useMutation(api.tasks.create);

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
            if (response.success) {
              toast.success(
                `Local workspace "${reservation.workspaceName}" created successfully`
              );
            } else {
              toast.error(
                response.error || "Failed to create local workspace"
              );
            }
            resolve();
          }
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
      ""
    ) as Id<"environments">;

    // Extract environment name from the selectedProject (format is "env:id:name")
    const environmentName = projectFullName.split(":")[2] || "Unknown Environment";

    setIsCreatingCloud(true);

    try {
      // Create task in Convex with environment name
      const taskId = await createTask({
        teamSlugOrId,
        text: `Cloud Workspace: ${environmentName}`,
        projectFullName: undefined, // No repo for cloud environment workspaces
        baseBranch: undefined, // No branch for environments
        environmentId,
        isCloudWorkspace: true,
      });

      // Hint the sidebar to auto-expand this task once it appears
      addTaskToExpand(taskId);

      await new Promise<void>((resolve) => {
        socket.emit(
          "create-cloud-workspace",
          {
            teamSlugOrId,
            environmentId,
            taskId,
            theme,
          },
          async (response: CreateCloudWorkspaceResponse) => {
            if (response.success) {
              toast.success("Cloud workspace created successfully");
            } else {
              toast.error(
                response.error || "Failed to create cloud workspace"
              );
            }
            resolve();
          }
        );
      });

      console.log("Cloud workspace created:", taskId);
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
    teamSlugOrId,
    createTask,
    addTaskToExpand,
    theme,
  ]);

  const handleCreateCloudRepositoryWorkspace = useCallback(async () => {
    if (!socket) {
      toast.error("Socket not connected");
      return;
    }

    if (selectedProject.length === 0) {
      toast.error("Please select a cloud repository first");
      return;
    }

    if (!isCloudRepoSelected) {
      toast.error("Cloud repository workspaces require a cloud repository");
      return;
    }

    const projectFullName = selectedProject[0];
    const repositoryId = projectFullName.replace(
      /^cloudrepo:/,
      ""
    ) as Id<"cloudRepositories">;

    // Extract repository name from the selectedProject (format is "cloudrepo:id:name")
    const repositoryName = projectFullName.split(":")[2] || "Unknown Repository";

    setIsCreatingCloudRepo(true);

    try {
      // Create task in Convex with repository name
      const taskId = await createTask({
        teamSlugOrId,
        text: `Cloud Repository Workspace: ${repositoryName}`,
        projectFullName: undefined,
        baseBranch: undefined,
        cloudRepositoryId: repositoryId,
        isCloudRepositoryWorkspace: true,
      });

      // Hint the sidebar to auto-expand this task once it appears
      addTaskToExpand(taskId);

      await new Promise<void>((resolve) => {
        socket.emit(
          "create-cloud-repository-workspace",
          {
            teamSlugOrId,
            repositoryId,
            taskId,
            theme,
          },
          async (response: CreateCloudRepositoryWorkspaceResponse) => {
            if (response.success) {
              toast.success("Cloud repository workspace created successfully");
            } else {
              toast.error(
                response.error || "Failed to create cloud repository workspace"
              );
            }
            resolve();
          }
        );
      });

      console.log("Cloud repository workspace created:", taskId);
    } catch (error) {
      console.error("Error creating cloud repository workspace:", error);
      toast.error("Failed to create cloud repository workspace");
    } finally {
      setIsCreatingCloudRepo(false);
    }
  }, [
    socket,
    selectedProject,
    isCloudRepoSelected,
    teamSlugOrId,
    createTask,
    addTaskToExpand,
    theme,
  ]);

  const canCreateLocal = selectedProject.length > 0 && !isEnvSelected && !isCloudRepoSelected;
  const canCreateCloud = selectedProject.length > 0 && isEnvSelected;
  const canCreateCloudRepo = selectedProject.length > 0 && isCloudRepoSelected;

  const SHOW_WORKSPACE_BUTTONS = false;

  if (!SHOW_WORKSPACE_BUTTONS) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 mb-3">
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
              <FolderOpen className="w-3.5 h-3.5" />
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

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCreateCloudWorkspace}
            disabled={!canCreateCloud || isCreatingCloud}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingCloud ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ServerIcon className="w-3.5 h-3.5" />
            )}
            <span>Create Cloud Workspace</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {!selectedProject.length
            ? "Select an environment first"
            : !isEnvSelected
              ? "Switch to environment mode (not repository)"
              : "Create workspace from selected environment"}
        </TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={handleCreateCloudRepositoryWorkspace}
            disabled={!canCreateCloudRepo || isCreatingCloudRepo}
            className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium transition-colors rounded-lg bg-white dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isCreatingCloudRepo ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Cloud className="w-3.5 h-3.5" />
            )}
            <span>Create Cloud Repository Workspace</span>
          </button>
        </TooltipTrigger>
        <TooltipContent>
          {!selectedProject.length
            ? "Select a cloud repository first"
            : !isCloudRepoSelected
              ? "Switch to cloud repository mode"
              : "Create workspace from selected cloud repository"}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
