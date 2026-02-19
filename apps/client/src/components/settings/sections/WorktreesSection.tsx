import { SettingRow } from "@/components/settings/SettingRow";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSegmented } from "@/components/settings/SettingSegmented";
import { Button } from "@/components/ui/button";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";
import { convexQuery } from "@convex-dev/react-query";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { FolderGit2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

type WorktreeMode = "legacy" | "codex-style";

interface WorktreesSectionProps {
  teamSlugOrId: string;
  worktreeMode: WorktreeMode;
  onWorktreeModeChange: (mode: WorktreeMode) => void;
  codexWorktreePathPattern: string;
  onCodexWorktreePathPatternChange: (value: string) => void;
}

export function WorktreesSection({
  teamSlugOrId,
  worktreeMode,
  onWorktreeModeChange,
  codexWorktreePathPattern,
  onCodexWorktreePathPatternChange,
}: WorktreesSectionProps) {
  const convex = useConvex();
  const [showAddMappingForm, setShowAddMappingForm] = useState(false);
  const [newProjectFullName, setNewProjectFullName] = useState("");
  const [newLocalRepoPath, setNewLocalRepoPath] = useState("");

  // Query source repo mappings
  const { data: sourceRepoMappings, refetch: refetchMappings } = useQuery(
    convexQuery(api.sourceRepoMappings.list, { teamSlugOrId })
  );

  // Query worktree registry
  const { data: worktreeRegistry, refetch: refetchRegistry } = useQuery(
    convexQuery(api.worktreeRegistry.list, { teamSlugOrId })
  );

  // Mutation to add source repo mapping
  const addSourceRepoMutation = useMutation({
    mutationFn: async ({
      projectFullName,
      localRepoPath,
    }: {
      projectFullName: string;
      localRepoPath: string;
    }) => {
      await convex.mutation(api.sourceRepoMappings.upsert, {
        teamSlugOrId,
        projectFullName,
        localRepoPath,
      });
    },
    onSuccess: () => {
      void refetchMappings();
      toast.success("Source repo mapping added");
      setShowAddMappingForm(false);
      setNewProjectFullName("");
      setNewLocalRepoPath("");
    },
    onError: (error) => {
      console.error("Failed to add source repo mapping:", error);
      toast.error("Failed to add source repo mapping");
    },
  });

  // Mutation to remove source repo mapping
  const removeSourceRepoMutation = useMutation({
    mutationFn: async (projectFullName: string) => {
      await convex.mutation(api.sourceRepoMappings.remove, {
        teamSlugOrId,
        projectFullName,
      });
    },
    onSuccess: () => {
      void refetchMappings();
      toast.success("Source repo mapping removed");
    },
    onError: (error) => {
      console.error("Failed to remove source repo mapping:", error);
      toast.error("Failed to remove source repo mapping");
    },
  });

  const handleAddMapping = () => {
    const trimmedProject = newProjectFullName.trim();
    const trimmedPath = newLocalRepoPath.trim();

    if (!trimmedProject) {
      toast.error("Please enter a repository name (e.g., owner/repo)");
      return;
    }
    if (!trimmedPath) {
      toast.error("Please enter a local path");
      return;
    }
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmedProject)) {
      toast.error("Invalid repository format. Use owner/repo format.");
      return;
    }

    addSourceRepoMutation.mutate({
      projectFullName: trimmedProject,
      localRepoPath: trimmedPath,
    });
  };

  // Mutation to remove worktree from registry
  const removeWorktreeMutation = useMutation({
    mutationFn: async (worktreePath: string) => {
      await convex.mutation(api.worktreeRegistry.remove, {
        teamSlugOrId,
        worktreePath,
      });
    },
    onSuccess: () => {
      void refetchRegistry();
      toast.success("Worktree removed from registry");
    },
    onError: (error) => {
      console.error("Failed to remove worktree:", error);
      toast.error("Failed to remove worktree");
    },
  });

  return (
    <div className="space-y-6">
      <SettingSection
        title="Worktree Mode"
        description="Choose how cmux creates worktrees for your tasks"
      >
        <SettingSegmented
          label="Mode"
          description={
            worktreeMode === "legacy"
              ? "Legacy: Creates a separate clone at ~/cmux/<repo>/origin/ for each project"
              : "Codex-style: Uses your existing local repos as the source, creating worktrees at ~/.cmux/worktrees/{id}/{repo}/"
          }
          value={worktreeMode}
          options={[
            { value: "legacy", label: "Legacy" },
            { value: "codex-style", label: "Codex-style" },
          ]}
          onValueChange={(value) => onWorktreeModeChange(value as WorktreeMode)}
        />

        {worktreeMode === "codex-style" && (
          <SettingRow
            label="Worktree path pattern"
            description="Custom path for Codex-style worktrees. Use ~ for home directory."
            noBorder
          >
            <div className="w-full sm:w-[20rem]">
              <input
                type="text"
                value={codexWorktreePathPattern}
                onChange={(e) => onCodexWorktreePathPatternChange(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
                placeholder="~/.cmux/worktrees/"
                autoComplete="off"
              />
            </div>
          </SettingRow>
        )}
      </SettingSection>

      {worktreeMode === "codex-style" && (
        <SettingSection
          title="Source Repo Mappings"
          description="Map GitHub repositories to local filesystem paths. When you start a task, cmux will use this local repo instead of cloning."
        >
          {/* Add mapping form */}
          {showAddMappingForm ? (
            <div className="border-b border-neutral-200 px-4 py-4 dark:border-neutral-800">
              <div className="space-y-3">
                <div>
                  <label
                    htmlFor="projectFullName"
                    className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Repository (owner/repo)
                  </label>
                  <input
                    id="projectFullName"
                    type="text"
                    value={newProjectFullName}
                    onChange={(e) => setNewProjectFullName(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                    placeholder="karlorz/testing-repo-1"
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label
                    htmlFor="localRepoPath"
                    className="mb-1 block text-xs font-medium text-neutral-700 dark:text-neutral-300"
                  >
                    Local path
                  </label>
                  <input
                    id="localRepoPath"
                    type="text"
                    value={newLocalRepoPath}
                    onChange={(e) => setNewLocalRepoPath(e.target.value)}
                    className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:placeholder:text-neutral-500"
                    placeholder="/Users/karlchow/code/testing-repo-1"
                    autoComplete="off"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddMapping}
                    disabled={addSourceRepoMutation.isPending}
                  >
                    {addSourceRepoMutation.isPending ? "Adding..." : "Add Mapping"}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowAddMappingForm(false);
                      setNewProjectFullName("");
                      setNewLocalRepoPath("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddMappingForm(true)}
                className="gap-1.5"
              >
                <Plus className="h-4 w-4" />
                Add Mapping
              </Button>
            </div>
          )}

          {/* Existing mappings list */}
          {sourceRepoMappings && sourceRepoMappings.length > 0 ? (
            <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
              {sourceRepoMappings.map((mapping: Doc<"sourceRepoMappings">) => (
                <div
                  key={mapping._id}
                  className="flex items-center justify-between px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {mapping.projectFullName}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {mapping.localRepoPath}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      removeSourceRepoMutation.mutate(mapping.projectFullName)
                    }
                    disabled={removeSourceRepoMutation.isPending}
                    className="ml-2 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            !showAddMappingForm && (
              <div className="px-4 py-8 text-center">
                <FolderGit2 className="mx-auto h-8 w-8 text-neutral-400" />
                <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                  No source repo mappings yet
                </p>
                <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                  Click "Add Mapping" to map a GitHub repository to a local path
                </p>
              </div>
            )
          )}
        </SettingSection>
      )}

      <SettingSection
        title="Active Worktrees"
        description="Worktrees created by cmux for your tasks"
      >
        {worktreeRegistry && worktreeRegistry.length > 0 ? (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {worktreeRegistry.map((worktree: Doc<"worktreeRegistry">) => (
              <div
                key={worktree._id}
                className="flex items-center justify-between px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                      {worktree.branchName}
                    </p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        worktree.mode === "codex-style"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      }`}
                    >
                      {worktree.mode === "codex-style" ? "codex" : "legacy"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-neutral-500 dark:text-neutral-400">
                    {worktree.worktreePath}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
                    {worktree.projectFullName} &middot; Last used{" "}
                    {new Date(worktree.lastUsedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    removeWorktreeMutation.mutate(worktree.worktreePath)
                  }
                  disabled={removeWorktreeMutation.isPending}
                  className="ml-2 text-neutral-500 hover:text-red-600 dark:text-neutral-400 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-8 text-center">
            <FolderGit2 className="mx-auto h-8 w-8 text-neutral-400" />
            <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
              No active worktrees
            </p>
            <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
              Worktrees will appear here when you start tasks
            </p>
          </div>
        )}
      </SettingSection>
    </div>
  );
}
