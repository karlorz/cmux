import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GitBranch,
  FolderGit2,
  Plus,
  Search,
  CheckCircle2,
  Info,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { saveOnboardingState } from "@/lib/onboarding";
import { getApiIntegrationsGithubReposOptions } from "@cmux/www-openapi-client/react-query";
import { useQuery as useRQ } from "@tanstack/react-query";
import type { GithubReposResponse } from "@cmux/www-openapi-client";

interface RepoSelectionStepProps {
  teamSlugOrId?: string;
}

interface GithubRepoItem {
  full_name: string;
  name: string;
  private: boolean;
  updated_at?: string;
}

export function RepoSelectionStep({ teamSlugOrId }: RepoSelectionStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);

  // Always call the hook, but with skip option when no teamSlugOrId
  const { data: githubRepos, isLoading, refetch } = useRQ({
    ...getApiIntegrationsGithubReposOptions({ query: { team: teamSlugOrId || "" } }),
    enabled: !!teamSlugOrId,
  });

  const repos = ((githubRepos as GithubReposResponse | undefined)?.repos || []) as GithubRepoItem[];

  // Filter repositories based on search
  const filteredRepos = repos.filter(
    (repo) =>
      repo.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  useEffect(() => {
    if (selectedRepos.length > 0) {
      saveOnboardingState({ reposConnected: selectedRepos });
    }
  }, [selectedRepos]);

  const handleToggleRepo = useCallback((repoId: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repoId)
        ? prev.filter((id) => id !== repoId)
        : [...prev, repoId]
    );
  }, []);

  const handleSyncRepos = async () => {
    setIsSyncing(true);
    try {
      // Sync selected repositories
      // This would typically call an API to sync the repos
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Simulated delay
      saveOnboardingState({ reposConnected: selectedRepos });
    } catch (error) {
      console.error("Failed to sync repositories:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center"
        >
          <FolderGit2 className="h-10 w-10 text-purple-600 dark:text-purple-400" />
        </motion.div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            Select Repositories
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            Choose which repositories you want to work with in cmux. You can add more later.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
          <Input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Repository list */}
        <div className="max-h-80 overflow-y-auto space-y-2 pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-neutral-400" />
            </div>
          ) : filteredRepos.length === 0 ? (
            <div className="text-center py-8">
              <FolderGit2 className="h-12 w-12 text-neutral-300 dark:text-neutral-700 mx-auto mb-3" />
              <p className="text-neutral-600 dark:text-neutral-400">
                {searchTerm ? "No repositories found matching your search" : "No repositories available"}
              </p>
              <Button
                variant="ghost"
                onClick={() => refetch()}
                className="mt-4 gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh repositories
              </Button>
            </div>
          ) : (
            filteredRepos.map((repo, index) => (
              <motion.div
                key={repo.full_name || index}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className={`
                  flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all
                  ${
                    selectedRepos.includes(repo.full_name)
                      ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30"
                      : "border-neutral-200 dark:border-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-900/50"
                  }
                `}
                onClick={() => handleToggleRepo(repo.full_name)}
              >
                <div className="flex-shrink-0">
                  {selectedRepos.includes(repo.full_name) ? (
                    <CheckCircle2 className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  ) : (
                    <GitBranch className="h-5 w-5 text-neutral-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-neutral-900 dark:text-neutral-100">
                      {repo.name}
                    </p>
                    {repo.private && (
                      <span className="px-1.5 py-0.5 text-xs rounded bg-neutral-200 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400">
                        Private
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                    {repo.updated_at && <span>Updated {repo.updated_at}</span>}
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </div>

        {selectedRepos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900"
          >
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                {selectedRepos.length} repositor{selectedRepos.length === 1 ? "y" : "ies"} selected
              </p>
              <Button
                size="sm"
                onClick={handleSyncRepos}
                disabled={isSyncing}
                className="gap-2"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <Plus className="h-3 w-3" />
                    Sync selected
                  </>
                )}
              </Button>
            </div>
          </motion.div>
        )}

        <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-900 dark:text-amber-100">
                Good to know:
              </p>
              <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200">
                <li>• Selected repos will be available for all team members</li>
                <li>• Private repos require GitHub App installation</li>
                <li>• You can add or remove repositories anytime</li>
                <li>• Each task runs in an isolated environment</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}