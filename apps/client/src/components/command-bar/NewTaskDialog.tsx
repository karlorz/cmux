import type { EditorApi } from "@/components/dashboard/DashboardInput";
import { DashboardMainCard } from "@/components/dashboard/DashboardMainCard";
import { useDashboardTaskComposer } from "@/components/dashboard/useDashboardTaskComposer";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useCallback, useMemo, useRef } from "react";

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
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        {open ? (
          <>
            <Dialog.Overlay className="fixed inset-0 bg-neutral-950/50 backdrop-blur-sm dark:bg-neutral-950/70" />
            <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-commandbar)+1] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900">
              <DialogInner teamSlugOrId={teamSlugOrId} onClose={handleClose} />
            </Dialog.Content>
          </>
        ) : null}
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function DialogInner({
  teamSlugOrId,
  onClose,
}: {
  teamSlugOrId: string;
  onClose: () => void;
}) {
  const editorApiRef = useRef<EditorApi | null>(null);
  const composer = useDashboardTaskComposer({
    teamSlugOrId,
    editorApiRef,
  });

  const title = useMemo(() => {
    if (composer.isEnvSelected) {
      return "Start a task in an environment";
    }
    return "Start a new task";
  }, [composer.isEnvSelected]);

  const handleStartTask = useCallback(() => {
    void composer
      .onStartTask()
      .then(() => {
        onClose();
      })
      .catch(() => undefined);
  }, [composer, onClose]);

  return (
    <div className="flex flex-col max-h-[85vh]">
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <Dialog.Title className="text-base font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </Dialog.Title>
        <Dialog.Close
          className="rounded-full p-1 text-neutral-500 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </Dialog.Close>
      </div>
      <div className="overflow-y-auto p-4">
        <DashboardMainCard
          editorApiRef={editorApiRef}
          onTaskDescriptionChange={composer.onTaskDescriptionChange}
          onSubmit={composer.onSubmit}
          lexicalRepoUrl={composer.lexicalRepoUrl}
          lexicalEnvironmentId={composer.lexicalEnvironmentId}
          lexicalBranch={composer.lexicalBranch}
          projectOptions={composer.projectOptions}
          selectedProject={composer.selectedProject}
          onProjectChange={composer.onProjectChange}
          onProjectSearchPaste={composer.onProjectSearchPaste}
          branchOptions={composer.branchOptions}
          selectedBranch={composer.selectedBranch}
          onBranchChange={composer.onBranchChange}
          selectedAgents={composer.selectedAgents}
          onAgentChange={composer.onAgentChange}
          isCloudMode={composer.isCloudMode}
          onCloudModeToggle={composer.onCloudModeToggle}
          isLoadingProjects={composer.isLoadingProjects}
          isLoadingBranches={composer.isLoadingBranches}
          teamSlugOrId={teamSlugOrId}
          cloudToggleDisabled={composer.cloudToggleDisabled}
          branchDisabled={composer.branchDisabled}
          providerStatus={composer.providerStatus}
          canSubmit={composer.canSubmit}
          onStartTask={handleStartTask}
        />
      </div>
    </div>
  );
}
