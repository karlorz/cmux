import { TaskComposerCard } from "@/components/dashboard/TaskComposerCard";
import type { EditorApi } from "@/components/dashboard/DashboardInput";
import { useTaskComposer } from "@/components/dashboard/useTaskComposer";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useRef } from "react";

interface CommandNewTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamSlugOrId: string;
}

export function CommandNewTaskDialog({
  open,
  onOpenChange,
  teamSlugOrId,
}: CommandNewTaskDialogProps) {
  const editorApiRef = useRef<EditorApi | null>(null);
  const {
    selectedProject,
    handleProjectChange,
    handleProjectSearchPaste,
    projectOptions,
    branchOptions,
    effectiveSelectedBranch,
    handleBranchChange,
    selectedAgents,
    handleAgentChange,
    isCloudMode,
    handleCloudModeToggle,
    isLoadingProjects,
    isLoadingBranches,
    providerStatus,
    canSubmit,
    startTask,
    handleTaskDescriptionChange,
    lexicalEnvironmentId,
    lexicalRepoUrl,
    lexicalBranch,
    isEnvSelected,
  } = useTaskComposer({ teamSlugOrId });

  const handleStartTask = useCallback(async () => {
    const success = await startTask(editorApiRef.current);
    if (success) {
      onOpenChange(false);
    }
  }, [onOpenChange, startTask]);

  const handleSubmit = useCallback(() => {
    void handleStartTask();
  }, [handleStartTask]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-modal)] bg-neutral-900/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-0 shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-800">
            <div>
              <Dialog.Title className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
                Start a task
              </Dialog.Title>
              <Dialog.Description className="text-sm text-neutral-500 dark:text-neutral-400">
                Compose a task without leaving your current view.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full p-2 text-neutral-500 hover:bg-neutral-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-400 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                <X className="h-5 w-5" />
                <span className="sr-only">Close</span>
              </button>
            </Dialog.Close>
          </div>
          <div className="px-6 py-4">
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
              persistenceKey="command-palette-task-description"
              editorMaxHeight="240px"
            />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
