import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/icons/github";
import {
  ArrowRight,
  Check,
  Loader2,
  Search,
  FolderGit2,
  AlertCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { useQuery as useRQ } from "@tanstack/react-query";
import { getApiIntegrationsGithubReposOptions } from "@cmux/www-openapi-client/react-query";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import type { GithubRepo } from "@cmux/www-openapi-client";

interface RepositorySyncStepProps {
  teamSlugOrId: string;
  onNext: () => void;
  onSkip: () => void;
  onReposSelected: (repos: string[]) => void;
  selectedRepos: string[];
  hasGitHubConnection: boolean;
}

export function RepositorySyncStep({
  teamSlugOrId,
  onNext,
  onSkip,
  onReposSelected,
  selectedRepos,
  hasGitHubConnection,
}: RepositorySyncStepProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedConnection, setSelectedConnection] = useState<number | null>(
    null
  );
  const debouncedSearch = useDebouncedValue(searchTerm, 300);

  const connections = useQuery(api.github.listProviderConnections, {
    teamSlugOrId,
  });

  // Auto-select first connection
  useEffect(() => {
    if (connections && connections.length > 0 && selectedConnection === null) {
      setSelectedConnection(connections[0].installationId);
    }
  }, [connections, selectedConnection]);

  const reposQuery = useRQ(
    getApiIntegrationsGithubReposOptions({
      query: {
        team: teamSlugOrId,
        installationId: selectedConnection ?? undefined,
        search: debouncedSearch || undefined,
        page: 1,
      },
    })
  );

  const repos = reposQuery.data?.repos ?? [];

  const handleToggleRepo = useCallback(
    (repoFullName: string) => {
      if (selectedRepos.includes(repoFullName)) {
        onReposSelected(selectedRepos.filter((r) => r !== repoFullName));
      } else {
        onReposSelected([...selectedRepos, repoFullName]);
      }
    },
    [selectedRepos, onReposSelected]
  );

  const handleContinue = useCallback(() => {
    onNext();
  }, [onNext]);

  if (!hasGitHubConnection) {
    return (
      <div className="flex flex-col">
        <div className="mb-6">
          <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
            Sync Your Repositories
          </h2>
          <p className="text-neutral-600 dark:text-neutral-400">
            Select the repositories you want to work with in cmux.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/50 dark:bg-amber-900/20">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-500 text-white">
              <AlertCircle className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-semibold text-amber-900 dark:text-amber-100">
                No GitHub Connection
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                You need to connect your GitHub account first to sync repositories. You can skip this step and connect later.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-4">
          <Button variant="ghost" onClick={onSkip}>
            Skip for Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Sync Your Repositories
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          Select the repositories you want to work with in cmux. You can add more later.
        </p>
      </div>

      {connections && connections.length > 1 && (
        <div className="mb-4">
          <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            GitHub Account
          </label>
          <div className="flex flex-wrap gap-2">
            {connections.map((conn) => (
              <button
                key={conn.installationId}
                onClick={() => setSelectedConnection(conn.installationId)}
                className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all ${
                  selectedConnection === conn.installationId
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:border-neutral-600"
                }`}
              >
                <GitHubIcon className="h-4 w-4" />
                {conn.accountLogin}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="text"
            placeholder="Search repositories..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
          />
        </div>
      </div>

      <div className="mb-6 max-h-96 overflow-y-auto rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900/50">
        {reposQuery.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : repos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FolderGit2 className="mb-3 h-12 w-12 text-neutral-300 dark:text-neutral-700" />
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {searchTerm ? "No repositories found" : "No repositories available"}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-200 dark:divide-neutral-800">
            {repos.map((repo: GithubRepo) => (
              <button
                key={repo.full_name}
                onClick={() => handleToggleRepo(repo.full_name)}
                className="flex w-full items-start gap-4 px-4 py-3 text-left transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
              >
                <div className="pt-1">
                  <div
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all ${
                      selectedRepos.includes(repo.full_name)
                        ? "border-primary bg-primary"
                        : "border-neutral-300 bg-white dark:border-neutral-600 dark:bg-neutral-900"
                    }`}
                  >
                    {selectedRepos.includes(repo.full_name) && (
                      <Check className="h-3 w-3 text-white" />
                    )}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-neutral-900 dark:text-neutral-100">
                      {repo.full_name}
                    </span>
                    {repo.private && (
                      <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-700 dark:bg-neutral-700 dark:text-neutral-300">
                        Private
                      </span>
                    )}
                  </div>
                  {repo.updated_at && (
                    <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-500">
                      Updated {formatTimeAgo(repo.updated_at)}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedRepos.length > 0 && (
        <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3 dark:border-neutral-800 dark:bg-neutral-900/50">
          <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {selectedRepos.length} {selectedRepos.length === 1 ? "repository" : "repositories"} selected
          </p>
        </div>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onSkip}>
          Skip for Now
        </Button>
        <Button onClick={handleContinue} className="gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function formatTimeAgo(input: string | number): string {
  const ts = typeof input === "number" ? input : Date.parse(input);
  if (Number.isNaN(ts)) return "";
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  const yr = Math.floor(mo / 12);
  return `${yr}y ago`;
}
