import {
  DashboardInput,
  type EditorApi,
} from "@/components/dashboard/DashboardInput";
import { DashboardInputControls } from "@/components/dashboard/DashboardInputControls";
import { DashboardInputFooter } from "@/components/dashboard/DashboardInputFooter";
import { DashboardStartTaskButton } from "@/components/dashboard/DashboardStartTaskButton";
import { useTheme } from "@/components/theme/use-theme";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useExpandTasks } from "@/contexts/expand-tasks/ExpandTasksContext";
import { useSocket } from "@/contexts/socket/use-socket";
import { createFakeConvexId } from "@/lib/fakeConvexId";
import { attachTaskLifecycleListeners } from "@/lib/socket/taskLifecycleListeners";
import { branchesQueryOptions } from "@/queries/branches";
import { api } from "@cmux/convex/api";
import type { Doc, Id } from "@cmux/convex/dataModel";
import type {
  ProviderStatusResponse,
  TaskAcknowledged,
  TaskError,
  TaskStarted,
} from "@cmux/shared";
import { AGENT_CONFIGS } from "@cmux/shared/agentConfig";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { parseGithubRepoUrl } from "@cmux/shared";
import type { SelectOption } from "@/components/ui/searchable-select";

interface NewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlugOrId: string;
}

// Default agents (not persisted to localStorage)
const DEFAULT_AGENTS = [
  "claude/sonnet-4.5",
  "claude/opus-4.1",
  "codex/gpt-5-codex-high",
];
const KNOWN_AGENT_NAMES = new Set(AGENT_CONFIGS.map((agent) => agent.name));
const DEFAULT_AGENT_SELECTION = DEFAULT_AGENTS.filter((agent) =>
  KNOWN_AGENT_NAMES.has(agent)
);

const AGENT_SELECTION_SCHEMA = z.array(z.string());

const filterKnownAgents = (agents: string[]): string[] =>
  agents.filter((agent) => KNOWN_AGENT_NAMES.has(agent));

const parseStoredAgentSelection = (stored: string | null): string[] => {
  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    const result = AGENT_SELECTION_SCHEMA.safeParse(parsed);
    if (!result.success) {
      console.warn("Invalid stored agent selection", result.error);
      return [];
    }

    return filterKnownAgents(result.data);
  } catch (error) {
    console.warn("Failed to parse stored agent selection", error);
    return [];
  }
};

export function NewTaskDialog({
  open,
  onOpenChange,
  teamSlugOrId,
}: NewTaskDialogProps) {
  const { socket } = useSocket();
  const { theme } = useTheme();
  const { addTaskToExpand } = useExpandTasks();

  const [selectedProject, setSelectedProject] = useState<string[]>(() => {
    const stored = localStorage.getItem(`selectedProject-${teamSlugOrId}`);
    return stored ? JSON.parse(stored) : [];
  });
  const [selectedBranch, setSelectedBranch] = useState<string[]>([]);

  const [selectedAgents, setSelectedAgentsState] = useState<string[]>(() => {
    const storedAgents = parseStoredAgentSelection(
      localStorage.getItem("selectedAgents")
    );

    if (storedAgents.length > 0) {
      return storedAgents;
    }

    return DEFAULT_AGENT_SELECTION.length > 0
      ? [...DEFAULT_AGENT_SELECTION]
      : [];
  });
  const selectedAgentsRef = useRef<string[]>(selectedAgents);

  const setSelectedAgents = useCallback(
    (agents: string[]) => {
      selectedAgentsRef.current = agents;
      setSelectedAgentsState(agents);
    },
    [setSelectedAgentsState]
  );

  const [taskDescription, setTaskDescription] = useState<string>("");
  const [isCloudMode, setIsCloudMode] = useState<boolean>(() => {
    const stored = localStorage.getItem("isCloudMode");
    return stored ? JSON.parse(stored) : true;
  });

  const [, setDockerReady] = useState<boolean | null>(null);
  const [providerStatus, setProviderStatus] =
    useState<ProviderStatusResponse | null>(null);

  // Ref to access editor API
  const editorApiRef = useRef<EditorApi | null>(null);

  const persistAgentSelection = useCallback((agents: string[]) => {
    try {
      const isDefaultSelection =
        DEFAULT_AGENT_SELECTION.length > 0 &&
        agents.length === DEFAULT_AGENT_SELECTION.length &&
        agents.every((agent, index) => agent === DEFAULT_AGENT_SELECTION[index]);

      if (agents.length === 0 || isDefaultSelection) {
        localStorage.removeItem("selectedAgents");
      } else {
        localStorage.setItem("selectedAgents", JSON.stringify(agents));
      }
    } catch (error) {
      console.warn("Failed to persist agent selection", error);
    }
  }, []);

  // Callback for task description changes
  const handleTaskDescriptionChange = useCallback((value: string) => {
    setTaskDescription(value);
  }, []);

  // Fetch branches for selected repo from Convex
  const isEnvSelected = useMemo(
    () => (selectedProject[0] || "").startsWith("env:"),
    [selectedProject]
  );

  const branchesQuery = useQuery({
    ...branchesQueryOptions({
      teamSlugOrId,
      repoFullName: selectedProject[0] || "",
    }),
    enabled: !!selectedProject[0] && !isEnvSelected,
  });
  const branchSummary = useMemo(() => {
    const data = branchesQuery.data;
    if (!data?.branches) {
      return {
        names: [] as string[],
        defaultName: undefined as string | undefined,
      };
    }
    const names = data.branches.map((branch) => branch.name);
    const fromResponse = data.defaultBranch?.trim();
    const flaggedDefault = data.branches.find(
      (branch) => branch.isDefault
    )?.name;
    const normalizedFromResponse =
      fromResponse && names.includes(fromResponse) ? fromResponse : undefined;
    const normalizedFlagged =
      flaggedDefault && names.includes(flaggedDefault) ? flaggedDefault : undefined;

    return {
      names,
      defaultName: normalizedFromResponse ?? normalizedFlagged,
    };
  }, [branchesQuery.data]);

  const branchNames = branchSummary.names;
  const remoteDefaultBranch = branchSummary.defaultName;

  // Callback for project selection changes
  const handleProjectChange = useCallback(
    (newProjects: string[]) => {
      setSelectedProject(newProjects);
      localStorage.setItem(
        `selectedProject-${teamSlugOrId}`,
        JSON.stringify(newProjects)
      );
      if (newProjects[0] !== selectedProject[0]) {
        setSelectedBranch([]);
      }
      // If selecting an environment, enforce cloud mode
      if ((newProjects[0] || "").startsWith("env:")) {
        setIsCloudMode(true);
        localStorage.setItem("isCloudMode", JSON.stringify(true));
      }
    },
    [selectedProject, teamSlugOrId]
  );

  const handleProjectSearchPaste = useCallback(
    async (value: string) => {
      const trimmedUrl = value.trim();
      const parsed = parseGithubRepoUrl(trimmedUrl);
      if (!parsed) {
        return false;
      }

      try {
        const result = await addManualRepo({
          teamSlugOrId,
          repoUrl: trimmedUrl,
        });

        if (result.success) {
          handleProjectChange([result.fullName]);
          toast.success(`Added ${result.fullName} to repositories`);
          return true;
        }
        return false;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Failed to add repository";
        toast.error(errorMessage);
        return false;
      }
    },
    [teamSlugOrId, handleProjectChange]
  );

  // Callback for branch selection changes
  const handleBranchChange = useCallback((newBranches: string[]) => {
    setSelectedBranch(newBranches);
  }, []);

  // Callback for agent selection changes
  const handleAgentChange = useCallback(
    (newAgents: string[]) => {
      const normalizedAgents = filterKnownAgents(newAgents);
      setSelectedAgents(normalizedAgents);
      persistAgentSelection(normalizedAgents);
    },
    [persistAgentSelection, setSelectedAgents]
  );

  // Fetch repos from Convex
  const reposByOrgQuery = useQuery({
    ...convexQuery(api.github.getReposByOrg, { teamSlugOrId }),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const reposByOrg = useMemo(
    () => reposByOrgQuery.data || {},
    [reposByOrgQuery.data]
  );

  const environmentsQuery = useQuery({
    ...convexQuery(api.environments.list, { teamSlugOrId }),
  });
  const environments = useMemo(
    () => environmentsQuery.data || [],
    [environmentsQuery.data]
  );

  const checkProviderStatus = useCallback(() => {
    if (!socket) return;

    socket.emit("check-provider-status", (response) => {
      if (!response) return;
      setProviderStatus(response);

      if (response.success) {
        const isRunning = response.dockerStatus?.isRunning;
        if (typeof isRunning === "boolean") {
          setDockerReady(isRunning);
        }
      }

      const currentAgents = selectedAgentsRef.current;
      if (currentAgents.length === 0) {
        return;
      }

      const providers = response.providers;
      if (!providers || providers.length === 0) {
        const normalizedOnly = filterKnownAgents(currentAgents);
        if (normalizedOnly.length !== currentAgents.length) {
          setSelectedAgents(normalizedOnly);
          persistAgentSelection(normalizedOnly);
        }
        return;
      }

      const availableAgents = new Set(
        providers
          .filter((provider) => provider.isAvailable)
          .map((provider) => provider.name)
      );

      const normalizedAgents = filterKnownAgents(currentAgents);
      const removedUnknown = normalizedAgents.length !== currentAgents.length;

      const filteredAgents = normalizedAgents.filter((agent) =>
        availableAgents.has(agent)
      );
      const removedUnavailable = normalizedAgents.filter(
        (agent) => !availableAgents.has(agent)
      );

      if (!removedUnknown && removedUnavailable.length === 0) {
        return;
      }

      setSelectedAgents(filteredAgents);
      persistAgentSelection(filteredAgents);

      if (removedUnavailable.length > 0) {
        const uniqueMissing = Array.from(new Set(removedUnavailable));
        if (uniqueMissing.length > 0) {
          const label = uniqueMissing.length === 1 ? "model" : "models";
          const verb = uniqueMissing.length === 1 ? "is" : "are";
          toast.warning(
            `${uniqueMissing.join(", ")} ${verb} not configured and was removed from the selection. Update credentials in Settings to use this ${label}.`
          );
        }
      }
    });
  }, [persistAgentSelection, setDockerReady, setSelectedAgents, socket]);

  // Mutation to create tasks with optimistic update
  const createTask = useMutation(api.tasks.create).withOptimisticUpdate(
    (localStore, args) => {
      const currentTasks = localStore.getQuery(api.tasks.get, {
        teamSlugOrId,
      });

      if (currentTasks !== undefined) {
        const now = Date.now();
        const optimisticTask = {
          _id: createFakeConvexId() as Doc<"tasks">["_id"],
          _creationTime: now,
          text: args.text,
          description: args.description,
          projectFullName: args.projectFullName,
          baseBranch: args.baseBranch,
          worktreePath: args.worktreePath,
          isCompleted: false,
          isArchived: false,
          createdAt: now,
          updatedAt: now,
          images: args.images,
          userId: "optimistic",
          teamId: teamSlugOrId,
          environmentId: args.environmentId,
        };

        // Add the new task at the beginning (since we order by desc)
        const listArgs: {
          teamSlugOrId: string;
          projectFullName?: string;
          archived?: boolean;
        } = {
          teamSlugOrId,
        };
        localStore.setQuery(api.tasks.get, listArgs, [
          optimisticTask,
          ...currentTasks,
        ]);
      }
    }
  );
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const addManualRepo = useAction(api.github_http.addManualRepo);

  const effectiveSelectedBranch = useMemo(() => {
    if (selectedBranch.length > 0) {
      return selectedBranch;
    }
    if (branchNames.length === 0) {
      return [];
    }
    const fallbackBranch = branchNames.includes("main")
      ? "main"
      : branchNames.includes("master")
        ? "master"
        : branchNames[0];
    const preferredBranch =
      remoteDefaultBranch && branchNames.includes(remoteDefaultBranch)
        ? remoteDefaultBranch
        : fallbackBranch;
    return [preferredBranch];
  }, [selectedBranch, branchNames, remoteDefaultBranch]);

  const handleStartTask = useCallback(async () => {
    // For local mode, perform a fresh docker check right before starting
    if (!isEnvSelected && !isCloudMode) {
      // Always check Docker status when in local mode, regardless of current state
      if (socket) {
        const ready = await new Promise<boolean>((resolve) => {
          socket.emit("check-provider-status", (response) => {
            const isRunning = !!response?.dockerStatus?.isRunning;
            if (typeof isRunning === "boolean") {
              setDockerReady(isRunning);
            }
            resolve(isRunning);
          });
        });

        // Only show the alert if Docker is actually not running after checking
        if (!ready) {
          toast.error("Docker is not running. Start Docker Desktop.");
          return;
        }
      } else {
        // If socket is not connected, we can't verify Docker status
        console.error("Cannot verify Docker status: socket not connected");
        toast.error(
          "Cannot verify Docker status. Please ensure the server is running."
        );
        return;
      }
    }

    if (!selectedProject[0] || !taskDescription.trim()) {
      console.error("Please select a project and enter a task description");
      return;
    }
    if (!socket) {
      console.error("Socket not connected");
      return;
    }

    // Use the effective selected branch (respects available branches and sensible defaults)
    const branch = effectiveSelectedBranch[0];
    const projectFullName = selectedProject[0];
    const envSelected = projectFullName.startsWith("env:");
    const environmentId = envSelected
      ? (projectFullName.replace(/^env:/, "") as Id<"environments">)
      : undefined;

    try {
      // Extract content including images from the editor
      const content = editorApiRef.current?.getContent();
      const images = content?.images || [];

      // Upload images to Convex storage first
      const uploadedImages = await Promise.all(
        images.map(
          async (image: {
            src: string;
            fileName?: string;
            altText: string;
          }) => {
            // Convert base64 to blob
            const base64Data = image.src.split(",")[1] || image.src;
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: "image/png" });
            const uploadUrl = await generateUploadUrl({
              teamSlugOrId,
            });
            const result = await fetch(uploadUrl, {
              method: "POST",
              headers: { "Content-Type": blob.type },
              body: blob,
            });
            const { storageId } = await result.json();

            return {
              storageId,
              fileName: image.fileName,
              altText: image.altText,
            };
          }
        )
      );

      // Clear input after successful task creation
      setTaskDescription("");
      // Force editor to clear
      handleTaskDescriptionChange("");
      if (editorApiRef.current?.clear) {
        editorApiRef.current.clear();
      }

      // Create task in Convex with storage IDs
      const taskId = await createTask({
        teamSlugOrId,
        text: content?.text || taskDescription, // Use content.text which includes image references
        projectFullName: envSelected ? undefined : projectFullName,
        baseBranch: envSelected ? undefined : branch,
        images: uploadedImages.length > 0 ? uploadedImages : undefined,
        environmentId,
      });

      // Hint the sidebar to auto-expand this task once it appears
      addTaskToExpand(taskId);

      const repoUrl = envSelected
        ? undefined
        : `https://github.com/${projectFullName}.git`;

      // For socket.io, we need to send the content text (which includes image references) and the images
      const handleStartTaskAck = (
        response: TaskAcknowledged | TaskStarted | TaskError
      ) => {
        if ("error" in response) {
          console.error("Task start error:", response.error);
          toast.error(`Task start error: ${JSON.stringify(response.error)}`);
          return;
        }

        attachTaskLifecycleListeners(socket, response.taskId, {
          addTaskToExpand,
          theme,
        });
      };

      if (isCloudMode || envSelected) {
        socket.emit(
          "start-cloud-task",
          {
            teamSlugOrId,
            taskId,
            environmentId,
            projectFullName: envSelected ? undefined : projectFullName,
            repoUrl,
            branch: envSelected ? undefined : branch,
            agents: selectedAgents,
            taskDescription: content?.text || taskDescription,
            images: uploadedImages,
            theme,
          },
          handleStartTaskAck
        );
      } else {
        socket.emit(
          "start-local-task",
          {
            teamSlugOrId,
            taskId,
            projectFullName,
            repoUrl,
            branch,
            agents: selectedAgents,
            taskDescription: content?.text || taskDescription,
            images: uploadedImages,
            theme,
          },
          handleStartTaskAck
        );
      }

      // Close the dialog after starting the task
      onOpenChange(false);
    } catch (error) {
      console.error("Task start error:", error);
      toast.error(`Task start error: ${String(error)}`);
    }
  }, [
    addTaskToExpand,
    createTask,
    effectiveSelectedBranch,
    generateUploadUrl,
    handleTaskDescriptionChange,
    isCloudMode,
    isEnvSelected,
    onOpenChange,
    selectedAgents,
    selectedProject,
    setDockerReady,
    socket,
    taskDescription,
    teamSlugOrId,
    theme,
  ]);

  const handleSubmit = useCallback(() => {
    void handleStartTask();
  }, [handleStartTask]);

  // Check provider status when socket becomes available
  useEffect(() => {
    if (socket && open) {
      checkProviderStatus();
    }
  }, [socket, checkProviderStatus, open]);

  // Convert repos by org to flat project options
  const projectOptions = useMemo<SelectOption[]>(() => {
    const repoOptions: SelectOption[] = [];

    for (const repos of Object.values(reposByOrg)) {
      for (const repo of repos ?? []) {
        repoOptions.push({
          label: repo.fullName,
          value: repo.fullName,
        });
      }
    }

    // Sort by last pushed at (most recent first)
    const sortedRepoOptions = repoOptions.sort((a, b) => {
      const aRepo = Object.values(reposByOrg)
        .flat()
        .find((r) => r?.fullName === a.value);
      const bRepo = Object.values(reposByOrg)
        .flat()
        .find((r) => r?.fullName === b.value);

      const aTime = aRepo?.lastPushedAt ?? 0;
      const bTime = bRepo?.lastPushedAt ?? 0;

      return bTime - aTime;
    });

    // Add environment options
    const envOptions: SelectOption[] = environments.map((env) => ({
      label: env.name,
      value: `env:${env._id}`,
    }));

    return [...envOptions, ...sortedRepoOptions];
  }, [reposByOrg, environments]);

  const canSubmit = useMemo(() => {
    return (
      !!selectedProject[0] &&
      taskDescription.trim().length > 0 &&
      selectedAgents.length > 0
    );
  }, [selectedProject, taskDescription, selectedAgents]);

  const disabledReason = useMemo(() => {
    if (!selectedProject[0]) {
      return "Select a project first";
    }
    if (taskDescription.trim().length === 0) {
      return "Enter a task description";
    }
    if (selectedAgents.length === 0) {
      return "Select at least one agent";
    }
    return undefined;
  }, [selectedProject, taskDescription, selectedAgents]);

  const handleCloudModeToggle = useCallback(() => {
    const newMode = !isCloudMode;
    setIsCloudMode(newMode);
    localStorage.setItem("isCloudMode", JSON.stringify(newMode));
  }, [isCloudMode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-neutral-200 dark:border-neutral-800">
          <DialogTitle>New Task</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="flex-1 overflow-y-auto px-6 pt-4">
            <div className="border border-neutral-200 dark:border-neutral-800 rounded-lg overflow-hidden bg-white dark:bg-neutral-900">
              <DashboardInput
                ref={editorApiRef}
                onTaskDescriptionChange={handleTaskDescriptionChange}
                onSubmit={handleSubmit}
                repoUrl={
                  !isEnvSelected && selectedProject[0]
                    ? `https://github.com/${selectedProject[0]}.git`
                    : undefined
                }
                branch={effectiveSelectedBranch[0]}
                environmentId={
                  isEnvSelected
                    ? (selectedProject[0]?.replace(/^env:/, "") as Id<"environments">)
                    : undefined
                }
                persistenceKey={`new-task-dialog-${teamSlugOrId}`}
                maxHeight="300px"
              />
              <DashboardInputFooter>
                <DashboardInputControls
                  projectOptions={projectOptions}
                  selectedProject={selectedProject}
                  onProjectChange={handleProjectChange}
                  onProjectSearchPaste={handleProjectSearchPaste}
                  branchOptions={branchNames}
                  selectedBranch={selectedBranch}
                  onBranchChange={handleBranchChange}
                  selectedAgents={selectedAgents}
                  onAgentChange={handleAgentChange}
                  isCloudMode={isCloudMode}
                  onCloudModeToggle={handleCloudModeToggle}
                  isLoadingProjects={reposByOrgQuery.isLoading}
                  isLoadingBranches={branchesQuery.isLoading}
                  teamSlugOrId={teamSlugOrId}
                  cloudToggleDisabled={isEnvSelected}
                  branchDisabled={isEnvSelected}
                  providerStatus={providerStatus}
                />
                <DashboardStartTaskButton
                  canSubmit={canSubmit}
                  onStartTask={handleStartTask}
                  disabledReason={disabledReason}
                />
              </DashboardInputFooter>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
