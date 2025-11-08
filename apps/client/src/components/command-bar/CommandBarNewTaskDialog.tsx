import { DashboardInput } from "@/components/dashboard/DashboardInput";
import { DashboardInputControls } from "@/components/dashboard/DashboardInputControls";
import { DashboardInputFooter } from "@/components/dashboard/DashboardInputFooter";
import { DashboardStartTaskButton } from "@/components/dashboard/DashboardStartTaskButton";
import { useTaskComposer } from "@/components/dashboard/useTaskComposer";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback } from "react";

interface CommandBarNewTaskDialogProps {
  teamSlugOrId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandBarNewTaskDialog({
  teamSlugOrId,
  open,
  onOpenChange,
}: CommandBarNewTaskDialogProps) {
  const {
    editorApiRef,
    onTaskDescriptionChange,
    onSubmit,
    onStartTask,
    lexicalRepoUrl,
    lexicalEnvironmentId,
    lexicalBranch,
    projectOptions,
    selectedProject,
    onProjectChange,
    onProjectSearchPaste,
    branchOptions,
    effectiveSelectedBranch,
    onBranchChange,
    selectedAgents,
    onAgentChange,
    isCloudMode,
    onCloudModeToggle,
    isLoadingProjects,
    isLoadingBranches,
    cloudToggleDisabled,
    branchDisabled,
    providerStatus,
    canSubmit,
  } = useTaskComposer(teamSlugOrId, { enableGlobalKeyListener: false });

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      if (!nextOpen) {
        onOpenChange(false);
      }
    },
    [onOpenChange]
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[calc(var(--z-commandbar)+1)] bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[calc(var(--z-commandbar)+2)] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white p-6 shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-start justify-between gap-4 pb-4">
            <div>
              <Dialog.Title className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
                Start a task
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                Describe what you want, pick a repo or environment, and run it without leaving the command palette.
              </Dialog.Description>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="rounded-2xl border border-neutral-200 dark:border-neutral-800">
            <DashboardInput
              ref={editorApiRef}
              onTaskDescriptionChange={onTaskDescriptionChange}
              onSubmit={onSubmit}
              repoUrl={lexicalRepoUrl}
              environmentId={lexicalEnvironmentId}
              branch={lexicalBranch}
              persistenceKey="command-palette-task-description"
              maxHeight="240px"
            />

            <DashboardInputFooter>
              <DashboardInputControls
                projectOptions={projectOptions}
                selectedProject={selectedProject}
                onProjectChange={onProjectChange}
                onProjectSearchPaste={onProjectSearchPaste}
                branchOptions={branchOptions}
                selectedBranch={effectiveSelectedBranch}
                onBranchChange={onBranchChange}
                selectedAgents={selectedAgents}
                onAgentChange={onAgentChange}
                isCloudMode={isCloudMode}
                onCloudModeToggle={onCloudModeToggle}
                isLoadingProjects={isLoadingProjects}
                isLoadingBranches={isLoadingBranches}
                teamSlugOrId={teamSlugOrId}
                cloudToggleDisabled={cloudToggleDisabled}
                branchDisabled={branchDisabled}
                providerStatus={providerStatus}
              />
              <DashboardStartTaskButton
                canSubmit={canSubmit}
                onStartTask={onStartTask}
              />
            </DashboardInputFooter>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
