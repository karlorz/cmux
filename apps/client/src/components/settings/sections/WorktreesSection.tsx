import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { WWW_ORIGIN } from "@/lib/wwwOrigin";
import { SettingRow } from "@/components/settings/SettingRow";
import { SettingSection } from "@/components/settings/SettingSection";
import { SettingSegmented } from "@/components/settings/SettingSegmented";
import { api } from "@cmux/convex/api";
import { convexQuery } from "@convex-dev/react-query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConvex } from "convex/react";
import { Loader2, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface WorktreesSectionProps {
  teamSlugOrId: string;
}

type WorktreeMode = "legacy" | "codex-style";

const DEFAULT_CODEX_WORKTREE_PATH_PATTERN =
  "~/.cmux/worktrees/{short-id}/{repo-name}";

export function WorktreesSection({ teamSlugOrId }: WorktreesSectionProps) {
  const convex = useConvex();
  const queryClient = useQueryClient();

  const workspaceSettingsQuery = convexQuery(api.workspaceSettings.get, {
    teamSlugOrId,
  });
  const sourceMappingsQuery = convexQuery(api.sourceRepoMappings.list, {
    teamSlugOrId,
  });
  const worktreeRegistryQuery = convexQuery(api.worktreeRegistry.list, {
    teamSlugOrId,
  });

  const { data: workspaceSettings } = useQuery(workspaceSettingsQuery);
  const { data: sourceMappings = [] } = useQuery(sourceMappingsQuery);
  const { data: registeredWorktrees = [] } = useQuery(worktreeRegistryQuery);

  const [worktreeMode, setWorktreeMode] = useState<WorktreeMode>("legacy");
  const [originalWorktreeMode, setOriginalWorktreeMode] =
    useState<WorktreeMode>("legacy");
  const [codexWorktreePathPattern, setCodexWorktreePathPattern] = useState(
    DEFAULT_CODEX_WORKTREE_PATH_PATTERN
  );
  const [originalCodexWorktreePathPattern, setOriginalCodexWorktreePathPattern] =
    useState(DEFAULT_CODEX_WORKTREE_PATH_PATTERN);

  const [projectFullNameInput, setProjectFullNameInput] = useState("");
  const [localRepoPathInput, setLocalRepoPathInput] = useState("");

  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isSavingMapping, setIsSavingMapping] = useState(false);
  const [isDeletingPath, setIsDeletingPath] = useState<string | null>(null);

  useEffect(() => {
    if (workspaceSettings === undefined) {
      return;
    }
    const nextMode = (workspaceSettings?.worktreeMode ??
      "legacy") as WorktreeMode;
    const nextPattern =
      workspaceSettings?.codexWorktreePathPattern ??
      DEFAULT_CODEX_WORKTREE_PATH_PATTERN;
    setWorktreeMode(nextMode);
    setOriginalWorktreeMode(nextMode);
    setCodexWorktreePathPattern(nextPattern);
    setOriginalCodexWorktreePathPattern(nextPattern);
  }, [workspaceSettings]);

  const hasModeSettingChanges =
    worktreeMode !== originalWorktreeMode ||
    codexWorktreePathPattern !== originalCodexWorktreePathPattern;

  const refreshWorktreeQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: workspaceSettingsQuery.queryKey,
    });
    await queryClient.invalidateQueries({
      queryKey: sourceMappingsQuery.queryKey,
    });
    await queryClient.invalidateQueries({
      queryKey: worktreeRegistryQuery.queryKey,
    });
  };

  const saveWorktreeSettings = async () => {
    if (!hasModeSettingChanges) {
      return;
    }

    setIsSavingSettings(true);
    try {
      await convex.mutation(api.workspaceSettings.update, {
        teamSlugOrId,
        worktreeMode,
        codexWorktreePathPattern:
          codexWorktreePathPattern.trim() || undefined,
      });
      setOriginalWorktreeMode(worktreeMode);
      setOriginalCodexWorktreePathPattern(codexWorktreePathPattern);
      await refreshWorktreeQueries();
      toast.success("Worktree settings saved");
    } catch (error) {
      toast.error("Failed to save worktree settings");
      console.error("Failed to save worktree settings:", error);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const addSourceRepoMapping = async () => {
    const projectFullName = projectFullNameInput.trim();
    const localRepoPath = localRepoPathInput.trim();

    if (!projectFullName || !localRepoPath) {
      toast.error("Project and local repo path are required");
      return;
    }
    if (!projectFullName.includes("/")) {
      toast.error("Project must be in owner/repo format");
      return;
    }

    setIsSavingMapping(true);
    try {
      await convex.mutation(api.sourceRepoMappings.upsert, {
        teamSlugOrId,
        projectFullName,
        localRepoPath,
        lastVerifiedAt: Date.now(),
      });
      setProjectFullNameInput("");
      setLocalRepoPathInput("");
      await queryClient.invalidateQueries({
        queryKey: sourceMappingsQuery.queryKey,
      });
      toast.success("Source repository mapping saved");
    } catch (error) {
      toast.error("Failed to save source repository mapping");
      console.error("Failed to save source repository mapping:", error);
    } finally {
      setIsSavingMapping(false);
    }
  };

  const removeSourceRepoMapping = async (projectFullName: string) => {
    setIsDeletingPath(projectFullName);
    try {
      await convex.mutation(api.sourceRepoMappings.remove, {
        teamSlugOrId,
        projectFullName,
      });
      await queryClient.invalidateQueries({
        queryKey: sourceMappingsQuery.queryKey,
      });
      toast.success("Source repository mapping removed");
    } catch (error) {
      toast.error("Failed to remove source repository mapping");
      console.error("Failed to remove source repository mapping:", error);
    } finally {
      setIsDeletingPath(null);
    }
  };

  const removeWorktree = async (worktreePath: string) => {
    setIsDeletingPath(worktreePath);
    try {
      const user = await cachedGetUser(stackClientApp);
      if (!user) {
        throw new Error("You must be signed in to remove worktrees");
      }

      const authHeaders = await user.getAuthHeaders();
      const headers = new Headers(authHeaders);
      headers.set("Content-Type", "application/json");
      const endpoint = new URL("/api/worktrees/remove", WWW_ORIGIN);
      const response = await fetch(endpoint.toString(), {
        method: "POST",
        headers,
        body: JSON.stringify({
          teamSlugOrId,
          worktreePath,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(payload?.message || "Failed to remove worktree");
      }

      await queryClient.invalidateQueries({
        queryKey: worktreeRegistryQuery.queryKey,
      });
      toast.success("Worktree removed");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to remove worktree";
      toast.error(message);
      console.error("Failed to remove worktree:", error);
    } finally {
      setIsDeletingPath(null);
    }
  };

  return (
    <div className="space-y-4">
      <SettingSection
        title="Worktree Mode"
        description="Choose whether cmux creates worktrees from legacy cloned origins or from your existing local repositories."
      >
        <SettingSegmented
          label="Mode"
          description="Legacy keeps current behavior at ~/cmux/<repo>/origin. Codex-style uses source repo mappings and writes worktrees under ~/.cmux/worktrees."
          value={worktreeMode}
          options={[
            { value: "legacy", label: "Legacy" },
            { value: "codex-style", label: "Codex-style" },
          ]}
          onValueChange={(value) => setWorktreeMode(value as WorktreeMode)}
        />

        <SettingRow
          label="Codex worktree path pattern"
          description="Use {short-id}, {repo-name}, and optional {branch} placeholders."
          noBorder
        >
          <div className="w-full sm:w-[28rem]">
            <input
              type="text"
              value={codexWorktreePathPattern}
              onChange={(event) => setCodexWorktreePathPattern(event.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder={DEFAULT_CODEX_WORKTREE_PATH_PATTERN}
              autoComplete="off"
            />
            <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
              Default: {DEFAULT_CODEX_WORKTREE_PATH_PATTERN}
            </p>
          </div>
        </SettingRow>

        <div className="flex justify-end border-t border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <button
            type="button"
            onClick={() => {
              void saveWorktreeSettings();
            }}
            disabled={!hasModeSettingChanges || isSavingSettings}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              !hasModeSettingChanges || isSavingSettings
                ? "cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                : "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            }`}
          >
            {isSavingSettings ? "Saving..." : "Save Worktree Settings"}
          </button>
        </div>
      </SettingSection>

      <SettingSection
        title="Source Repository Mappings"
        description="Map owner/repo projects to local repository paths used in codex-style mode."
      >
        <SettingRow
          label="Add mapping"
          description="Set the project full name and the local repository path."
        >
          <div className="w-full sm:w-[28rem] space-y-2">
            <input
              type="text"
              value={projectFullNameInput}
              onChange={(event) => setProjectFullNameInput(event.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder="owner/repo"
              autoComplete="off"
            />
            <input
              type="text"
              value={localRepoPathInput}
              onChange={(event) => setLocalRepoPathInput(event.target.value)}
              className="w-full rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm text-neutral-900 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
              placeholder="/Users/you/code/repo"
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => {
                void addSourceRepoMapping();
              }}
              disabled={isSavingMapping}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                isSavingMapping
                  ? "cursor-not-allowed bg-neutral-200 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400"
                  : "bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
              }`}
            >
              {isSavingMapping ? "Saving..." : "Add Mapping"}
            </button>
          </div>
        </SettingRow>

        {sourceMappings.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400">
            No source repository mappings yet.
          </div>
        ) : (
          sourceMappings.map((mapping, index) => (
            <SettingRow
              key={mapping._id}
              label={mapping.projectFullName}
              description={mapping.localRepoPath}
              noBorder={index === sourceMappings.length - 1}
            >
              <button
                type="button"
                onClick={() => {
                  void removeSourceRepoMapping(mapping.projectFullName);
                }}
                disabled={isDeletingPath === mapping.projectFullName}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {isDeletingPath === mapping.projectFullName ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </SettingRow>
          ))
        )}
      </SettingSection>

      <SettingSection
        title="Active Worktrees"
        description="Worktrees registered by cmux for your current team and account."
      >
        {registeredWorktrees.length === 0 ? (
          <div className="px-4 py-6 text-sm text-neutral-500 dark:text-neutral-400">
            No active worktrees registered.
          </div>
        ) : (
          registeredWorktrees.map((worktree, index) => (
            <SettingRow
              key={worktree._id}
              label={`${worktree.branchName} (${worktree.mode})`}
              description={
                <>
                  <span>{worktree.worktreePath}</span>
                  <br />
                  <span>Source: {worktree.sourceRepoPath}</span>
                  <br />
                  <span>Task runs: {worktree.taskRunIds?.length ?? 0}</span>
                </>
              }
              noBorder={index === registeredWorktrees.length - 1}
            >
              <button
                type="button"
                onClick={() => {
                  void removeWorktree(worktree.worktreePath);
                }}
                disabled={isDeletingPath === worktree.worktreePath}
                className="inline-flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                {isDeletingPath === worktree.worktreePath ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                Remove
              </button>
            </SettingRow>
          ))
        )}
      </SettingSection>
    </div>
  );
}
