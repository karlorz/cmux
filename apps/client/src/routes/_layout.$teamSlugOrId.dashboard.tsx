import type { EditorApi } from "@/components/dashboard/DashboardInput";
import { TaskComposerCard } from "@/components/dashboard/TaskComposerCard";
import { useTaskComposer } from "@/components/dashboard/useTaskComposer";
import { TaskList } from "@/components/dashboard/TaskList";
import { WorkspaceCreationButtons } from "@/components/dashboard/WorkspaceCreationButtons";
import { FloatingPane } from "@/components/floating-pane";
import { TitleBar } from "@/components/TitleBar";
import { useSocket } from "@/contexts/socket/use-socket";
import { clearEnvironmentDraft } from "@/state/environment-draft-store";
import type { MorphSnapshotId } from "@cmux/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/_layout/$teamSlugOrId/dashboard")({
  component: DashboardComponent,
});

type EnvironmentNewSearchParams = {
  step: "select" | "configure" | undefined;
  selectedRepos: string[] | undefined;
  instanceId: string | undefined;
  connectionLogin: string | undefined;
  repoSearch: string | undefined;
  snapshotId: MorphSnapshotId | undefined;
};

function DashboardComponent() {
  const { teamSlugOrId } = Route.useParams();
  const searchParams = Route.useSearch() as { environmentId?: string };
  const { socket } = useSocket();
  const editorApiRef = useRef<EditorApi | null>(null);
  const {
    selectedProject,
    handleProjectChange,
    handleProjectSearchPaste,
    projectOptions,
    isLoadingProjects,
    isEnvSelected,
    selectedRepoFullName,
    selectedRepoInfo,
    branchOptions,
    effectiveSelectedBranch,
    handleBranchChange,
    selectedAgents,
    handleAgentChange,
    isCloudMode,
    handleCloudModeToggle,
    isLoadingBranches,
    providerStatus,
    handleTaskDescriptionChange,
    taskDescription,
    canSubmit,
    startTask,
    lexicalEnvironmentId,
    lexicalRepoUrl,
    lexicalBranch,
  } = useTaskComposer({ teamSlugOrId });
  const [hasDismissedCloudRepoOnboarding, setHasDismissedCloudRepoOnboarding] =
    useState(false);

  useEffect(() => {
    if (searchParams?.environmentId) {
      handleProjectChange([`env:${searchParams.environmentId}`]);
    }
  }, [handleProjectChange, searchParams?.environmentId]);

  useEffect(() => {
    setHasDismissedCloudRepoOnboarding(false);
  }, [selectedRepoFullName]);

  const shouldShowCloudRepoOnboarding =
    !!selectedRepoFullName &&
    isCloudMode &&
    !isEnvSelected &&
    !hasDismissedCloudRepoOnboarding;

  const createEnvironmentSearch = useMemo<
    EnvironmentNewSearchParams | undefined
  >(
    () =>
      selectedRepoFullName
        ? {
          step: "select",
          selectedRepos: [selectedRepoFullName],
          instanceId: undefined,
          connectionLogin:
            selectedRepoInfo?.org ?? selectedRepoInfo?.ownerLogin ?? undefined,
          repoSearch: undefined,
          snapshotId: undefined,
        }
        : undefined,
    [selectedRepoFullName, selectedRepoInfo],
  );

  const handleStartEnvironmentSetup = useCallback(() => {
    clearEnvironmentDraft(teamSlugOrId);
  }, [teamSlugOrId]);

  // Listen for VSCode spawned events
  useEffect(() => {
    if (!socket) return;

    const handleVSCodeSpawned = (data: {
      instanceId: string;
      url: string;
      workspaceUrl: string;
      provider: string;
    }) => {
      console.log("VSCode spawned:", data);
      // Open in new tab
      // window.open(data.workspaceUrl, "_blank");
    };

    socket.on("vscode-spawned", handleVSCodeSpawned);

    return () => {
      socket.off("vscode-spawned", handleVSCodeSpawned);
    };
  }, [socket]);

  // Listen for default repo from CLI
  useEffect(() => {
    if (!socket) return;

    const handleDefaultRepo = (data: {
      repoFullName: string;
      branch?: string;
      localPath: string;
    }) => {
      handleProjectChange([data.repoFullName]);
      if (data.branch) {
        handleBranchChange([data.branch]);
      }
    };

    socket.on("default-repo", handleDefaultRepo);

    return () => {
      socket.off("default-repo", handleDefaultRepo);
    };
  }, [handleBranchChange, handleProjectChange, socket]);

  // Global keydown handler for autofocus
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Skip if already focused on an input, textarea, or contenteditable that's NOT the editor
      const activeElement = document.activeElement;
      const isEditor =
        activeElement?.getAttribute("data-cmux-input") === "true";
      const isCommentInput = activeElement?.id === "cmux-comments-root";
      if (
        !isEditor &&
        (activeElement?.tagName === "INPUT" ||
          activeElement?.tagName === "TEXTAREA" ||
          activeElement?.getAttribute("contenteditable") === "true" ||
          activeElement?.closest('[contenteditable="true"]') ||
          isCommentInput)
      ) {
        return;
      }

      // Skip for modifier keys and special keys
      if (
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        e.key === "Tab" ||
        e.key === "Escape" ||
        e.key === "Enter" ||
        e.key.startsWith("F") || // Function keys
        e.key.startsWith("Arrow") ||
        e.key === "Home" ||
        e.key === "End" ||
        e.key === "PageUp" ||
        e.key === "PageDown" ||
        e.key === "Delete" ||
        e.key === "Backspace" ||
        e.key === "CapsLock" ||
        e.key === "Control" ||
        e.key === "Shift" ||
        e.key === "Alt" ||
        e.key === "Meta" ||
        e.key === "ContextMenu"
      ) {
        return;
      }

      // Check if it's a printable character (including shift for uppercase)
      if (e.key.length === 1) {
        // Prevent default to avoid duplicate input
        e.preventDefault();

        // Focus the editor and insert the character
        if (editorApiRef.current?.focus) {
          editorApiRef.current.focus();

          // Insert the typed character
          if (editorApiRef.current.insertText) {
            editorApiRef.current.insertText(e.key);
          }
        }
      }
    };

    document.addEventListener("keydown", handleGlobalKeyDown);

    return () => {
      document.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, []);

  // Do not pre-disable UI on Docker status; handle fresh check on submit

  const handleStartTask = useCallback(() => {
    return startTask(editorApiRef.current);
  }, [startTask]);

  const handleSubmit = useCallback(() => {
    if (selectedProject[0] && taskDescription.trim()) {
      void handleStartTask();
    }
  }, [handleStartTask, selectedProject, taskDescription]);

  return (
    <FloatingPane header={<TitleBar title="cmux" />}>
      <div className="flex flex-col grow overflow-y-auto">
        {/* Main content area */}
        <div className="flex-1 flex justify-center px-4 pt-60 pb-4">
          <div className="w-full max-w-4xl min-w-0">
            {/* Workspace Creation Buttons */}
            <WorkspaceCreationButtons
              teamSlugOrId={teamSlugOrId}
              selectedProject={selectedProject}
              isEnvSelected={isEnvSelected}
            />

            <TaskComposerCard
              editorApiRef={editorApiRef}
              onTaskDescriptionChange={handleTaskDescriptionChange}
              onSubmit={handleSubmit}
              repoUrl={lexicalRepoUrl}
              environmentId={lexicalEnvironmentId}
              branch={lexicalBranch}
              projectOptions={projectOptions}
              selectedProject={selectedProject}
              onProjectChange={handleProjectChange}
              onProjectSearchPaste={handleProjectSearchPaste}
              branchOptions={branchOptions}
              selectedBranch={effectiveSelectedBranch}
              onBranchChange={handleBranchChange}
              selectedAgents={selectedAgents}
              onAgentChange={handleAgentChange}
              isCloudMode={isCloudMode}
              onCloudModeToggle={handleCloudModeToggle}
              isLoadingProjects={isLoadingProjects}
              isLoadingBranches={isLoadingBranches}
              teamSlugOrId={teamSlugOrId}
              cloudToggleDisabled={isEnvSelected}
              branchDisabled={isEnvSelected || !selectedProject[0]}
              providerStatus={providerStatus}
              canSubmit={canSubmit}
              onStartTask={() => {
                void handleStartTask();
              }}
            />
            {shouldShowCloudRepoOnboarding && createEnvironmentSearch ? (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-blue-200/60 dark:border-blue-500/40 bg-blue-50/80 dark:bg-blue-500/10 px-3 py-2 text-sm text-blue-900 dark:text-blue-100">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500 dark:text-blue-300" />
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-blue-900 dark:text-blue-100">
                    Set up an environment for {selectedRepoFullName}
                  </p>
                  <p className="text-xs text-blue-900/80 dark:text-blue-200/80">
                    Environments let you preconfigure development and maintenance scripts, pre-install packages, and environment variables so cloud workspaces are ready to go the moment they start.
                  </p>
                  <div className="flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setHasDismissedCloudRepoOnboarding(true)}
                      className="inline-flex items-center rounded-md border border-blue-200/60 bg-white/80 px-2 py-1 text-xs font-medium text-blue-900/70 hover:bg-white dark:border-blue-500/30 dark:bg-blue-500/5 dark:text-blue-100/80 dark:hover:bg-blue-500/15"
                    >
                      Dismiss
                    </button>
                    <Link
                      to="/$teamSlugOrId/environments/new"
                      params={{ teamSlugOrId }}
                      search={createEnvironmentSearch}
                      onClick={handleStartEnvironmentSetup}
                      className="inline-flex items-center rounded-md border border-blue-500/60 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-900 dark:text-blue-100 hover:bg-blue-500/20"
                    >
                      Create environment
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Task List */}
            <TaskList teamSlugOrId={teamSlugOrId} />
          </div>
        </div>
      </div>
    </FloatingPane>
  );
}
