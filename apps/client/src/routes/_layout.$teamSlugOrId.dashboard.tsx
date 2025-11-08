import {
  DashboardInput,
  type EditorApi,
} from "@/components/dashboard/DashboardInput";
import { DashboardInputControls } from "@/components/dashboard/DashboardInputControls";
import { DashboardInputFooter } from "@/components/dashboard/DashboardInputFooter";
import { DashboardStartTaskButton } from "@/components/dashboard/DashboardStartTaskButton";
import { TaskList } from "@/components/dashboard/TaskList";
import { WorkspaceCreationButtons } from "@/components/dashboard/WorkspaceCreationButtons";
import { FloatingPane } from "@/components/floating-pane";
import { useTaskComposer } from "@/components/dashboard/useTaskComposer";
import { TitleBar } from "@/components/TitleBar";
import type { SelectOption } from "@/components/ui/searchable-select";
import type { Id } from "@cmux/convex/dataModel";
import type { ProviderStatusResponse } from "@cmux/shared";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Info } from "lucide-react";
import { useEffect } from "react";

export const Route = createFileRoute("/_layout/$teamSlugOrId/dashboard")({
  component: DashboardComponent,
});

function DashboardComponent() {
  const { teamSlugOrId } = Route.useParams();
  const searchParams = Route.useSearch() as { environmentId?: string };

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
    isEnvSelected,
    shouldShowCloudRepoOnboarding,
    createEnvironmentSearch,
    dismissCloudRepoOnboarding,
    selectedRepoFullName,
    onStartEnvironmentSetup,
  } = useTaskComposer(teamSlugOrId, { enableGlobalKeyListener: true });

  useEffect(() => {
    if (searchParams?.environmentId) {
      onProjectChange([`env:${searchParams.environmentId}`]);
    }
  }, [onProjectChange, searchParams?.environmentId]);

  return (
    <FloatingPane header={<TitleBar title="cmux" />}>
      <div className="flex flex-col grow overflow-y-auto">
        <div className="flex-1 flex justify-center px-4 pt-60 pb-4">
          <div className="w-full max-w-4xl min-w-0">
            <WorkspaceCreationButtons
              teamSlugOrId={teamSlugOrId}
              selectedProject={selectedProject}
              isEnvSelected={isEnvSelected}
            />

            <DashboardMainCard
              editorApiRef={editorApiRef}
              onTaskDescriptionChange={onTaskDescriptionChange}
              onSubmit={onSubmit}
              lexicalRepoUrl={lexicalRepoUrl}
              lexicalEnvironmentId={lexicalEnvironmentId}
              lexicalBranch={lexicalBranch}
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
              canSubmit={canSubmit}
              onStartTask={onStartTask}
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
                      onClick={dismissCloudRepoOnboarding}
                      className="inline-flex items-center rounded-md border border-blue-200/60 bg-white/80 px-2 py-1 text-xs font-medium text-blue-900/70 hover:bg-white dark:border-blue-500/30 dark:bg-blue-500/5 dark:text-blue-100/80 dark:hover:bg-blue-500/15"
                    >
                      Dismiss
                    </button>
                    <Link
                      to="/$teamSlugOrId/environments/new"
                      params={{ teamSlugOrId }}
                      search={createEnvironmentSearch}
                      onClick={onStartEnvironmentSetup}
                      className="inline-flex items-center rounded-md border border-blue-500/60 bg-blue-500/10 px-2 py-1 text-xs font-medium text-blue-900 dark:text-blue-100 hover:bg-blue-500/20"
                    >
                      Create environment
                    </Link>
                  </div>
                </div>
              </div>
            ) : null}

            <TaskList teamSlugOrId={teamSlugOrId} />
          </div>
        </div>
      </div>
    </FloatingPane>
  );
}

type DashboardMainCardProps = {
  editorApiRef: React.RefObject<EditorApi | null>;
  onTaskDescriptionChange: (value: string) => void;
  onSubmit: () => void;
  lexicalRepoUrl?: string;
  lexicalEnvironmentId?: Id<"environments">;
  lexicalBranch?: string;
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
};

function DashboardMainCard({
  editorApiRef,
  onTaskDescriptionChange,
  onSubmit,
  lexicalRepoUrl,
  lexicalEnvironmentId,
  lexicalBranch,
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
}: DashboardMainCardProps) {
  return (
    <div className="relative bg-white dark:bg-neutral-700/50 border border-neutral-500/15 dark:border-neutral-500/15 rounded-2xl transition-all">
      <DashboardInput
        ref={editorApiRef}
        onTaskDescriptionChange={onTaskDescriptionChange}
        onSubmit={onSubmit}
        repoUrl={lexicalRepoUrl}
        environmentId={lexicalEnvironmentId}
        branch={lexicalBranch}
        persistenceKey="dashboard-task-description"
        maxHeight="300px"
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
        <DashboardStartTaskButton
          canSubmit={canSubmit}
          onStartTask={onStartTask}
        />
      </DashboardInputFooter>
    </div>
  );
}
