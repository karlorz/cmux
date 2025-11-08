import {
  DashboardInput,
  type EditorApi,
} from "@/components/dashboard/DashboardInput";
import { DashboardInputControls } from "@/components/dashboard/DashboardInputControls";
import { DashboardInputFooter } from "@/components/dashboard/DashboardInputFooter";
import { DashboardStartTaskButton } from "@/components/dashboard/DashboardStartTaskButton";
import type { SelectOption } from "@/components/ui/searchable-select";
import type { ProviderStatusResponse } from "@cmux/shared";
import type { Id } from "@cmux/convex/dataModel";
import clsx from "clsx";

interface TaskComposerCardProps {
  editorApiRef: React.RefObject<EditorApi | null>;
  onTaskDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  repoUrl?: string;
  branch?: string;
  environmentId?: Id<"environments">;
  projectOptions: SelectOption[];
  selectedProject: string[];
  onProjectChange: (newProjects: string[]) => void;
  onProjectSearchPaste?: (value: string) => boolean | Promise<boolean>;
  branchOptions: string[];
  selectedBranch: string[];
  onBranchChange: (newBranches: string[]) => void;
  selectedAgents: string[];
  onAgentChange: (newAgents: string[]) => void;
  isCloudMode: boolean;
  onCloudModeToggle: () => void;
  isLoadingProjects: boolean;
  isLoadingBranches: boolean;
  teamSlugOrId: string;
  cloudToggleDisabled: boolean;
  branchDisabled: boolean;
  providerStatus: ProviderStatusResponse | null;
  canSubmit: boolean;
  onStartTask: () => void;
  persistenceKey?: string;
  editorMaxHeight?: string;
  className?: string;
}

export function TaskComposerCard({
  editorApiRef,
  onTaskDescriptionChange,
  onSubmit,
  repoUrl,
  branch,
  environmentId,
  projectOptions,
  selectedProject,
  onProjectChange,
  onProjectSearchPaste,
  branchOptions,
  selectedBranch,
  onBranchChange,
  selectedAgents,
  onAgentChange,
  isCloudMode,
  onCloudModeToggle,
  isLoadingProjects,
  isLoadingBranches,
  teamSlugOrId,
  cloudToggleDisabled,
  branchDisabled,
  providerStatus,
  canSubmit,
  onStartTask,
  persistenceKey = "dashboard-task-description",
  editorMaxHeight = "300px",
  className,
}: TaskComposerCardProps) {
  return (
    <div
      className={clsx(
        "relative rounded-2xl border border-neutral-500/15 bg-white transition-all dark:border-neutral-500/15 dark:bg-neutral-700/50",
        className
      )}
    >
      <DashboardInput
        ref={editorApiRef}
        onTaskDescriptionChange={onTaskDescriptionChange}
        onSubmit={onSubmit}
        repoUrl={repoUrl}
        environmentId={environmentId}
        branch={branch}
        persistenceKey={persistenceKey}
        maxHeight={editorMaxHeight}
      />

      <DashboardInputFooter>
        <DashboardInputControls
          projectOptions={projectOptions}
          selectedProject={selectedProject}
          onProjectChange={onProjectChange}
          onProjectSearchPaste={onProjectSearchPaste}
          branchOptions={branchOptions}
          selectedBranch={selectedBranch}
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
        <DashboardStartTaskButton canSubmit={canSubmit} onStartTask={onStartTask} />
      </DashboardInputFooter>
    </div>
  );
}
