"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Github, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";

interface RepoSelectionFlowProps {
  teamId: string;
  teamDisplayName: string;
}

interface Repository {
  name: string;
  full_name: string;
  private: boolean;
  updated_at?: string | null;
  pushed_at?: string | null;
}

type Step = "install" | "select" | "installing";

export function RepoSelectionFlow({
  teamId,
  teamDisplayName,
}: RepoSelectionFlowProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("installing");
  const [repos, setRepos] = useState<Repository[]>([]);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);

  // Check if GitHub app is installed and fetch repos
  useEffect(() => {
    async function checkInstallation() {
      try {
        const response = await fetch(
          `/api/integrations/github/repos?team=${encodeURIComponent(teamId)}`,
        );

        if (!response.ok) {
          if (response.status === 401) {
            setError("Please sign in to continue");
            setIsLoading(false);
            return;
          }
          throw new Error("Failed to fetch repositories");
        }

        const data = (await response.json()) as { repos: Repository[] };

        // If no repos found, probably no installation
        if (data.repos.length === 0) {
          setStep("install");
          setIsLoading(false);
          return;
        }

        setRepos(data.repos);
        setStep("select");
        setIsLoading(false);
      } catch (err) {
        console.error("Failed to check installation:", err);
        setError(
          err instanceof Error ? err.message : "Failed to check installation",
        );
        setIsLoading(false);
      }
    }

    checkInstallation();
  }, [teamId]);

  const handleInstallApp = useCallback(async () => {
    setIsRedirecting(true);
    setError(null);

    try {
      const currentUrl = window.location.href;
      try {
        sessionStorage.setItem("preview_setup_return_url", currentUrl);
      } catch (storageError) {
        console.warn("Failed to persist return URL", storageError);
      }

      const githubAppSlug = process.env.NEXT_PUBLIC_GITHUB_APP_SLUG;
      if (!githubAppSlug) {
        setError("GitHub App is not configured. Please contact support.");
        setIsRedirecting(false);
        return;
      }

      const response = await fetch("/api/integrations/github/install-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teamSlugOrId: teamId,
          returnUrl: currentUrl,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        if (response.status === 403) {
          setError(
            "You do not have permission to install the GitHub App for this team.",
          );
        } else if (response.status === 401) {
          setError("You need to sign in first. Redirecting...");
          setTimeout(() => {
            window.location.href = "/sign-in?after_auth_return_to=/preview/setup";
          }, 2000);
        } else {
          setError(`Failed to start installation: ${text}`);
        }
        setIsRedirecting(false);
        return;
      }

      const { state } = (await response.json()) as { state: string };
      const installUrl = new URL(
        `https://github.com/apps/${githubAppSlug}/installations/new`,
      );
      installUrl.searchParams.set("state", state);

      window.location.href = installUrl.toString();
    } catch (err) {
      console.error("Failed to initiate installation", err);
      setError("An unexpected error occurred. Please try again.");
      setIsRedirecting(false);
    }
  }, [teamId]);

  const handleRepoToggle = (repoFullName: string) => {
    setSelectedRepos((prev) =>
      prev.includes(repoFullName)
        ? prev.filter((r) => r !== repoFullName)
        : [...prev, repoFullName],
    );
    setError(null); // Clear any previous errors
  };

  const handleContinue = () => {
    if (selectedRepos.length === 0) {
      setError("Please select at least one repository");
      return;
    }
    // Navigate to config page with selected repos
    const params = new URLSearchParams();
    selectedRepos.forEach((repo) => params.append("repo", repo));
    router.push(`/preview/configure?${params.toString()}`);
  };

  if (isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="flex items-center gap-3 text-neutral-300">
          <Loader2 className="h-6 w-6 animate-spin" />
          <span>Checking GitHub app installation...</span>
        </div>
      </div>
    );
  }

  if (step === "install") {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/10">
                <AlertCircle className="h-6 w-6 text-amber-400" />
              </div>
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-semibold text-white">
                Install cmux GitHub App
              </h1>
              <p className="mt-3 text-neutral-300">
                To use cmux preview, you need to install the cmux GitHub App for{" "}
                <span className="font-semibold text-white">
                  {teamDisplayName}
                </span>
                .
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-lg border border-white/10 bg-neutral-950/50 p-4">
                  <h2 className="mb-2 text-sm font-semibold text-white">
                    What happens next:
                  </h2>
                  <ol className="space-y-2 text-sm text-neutral-300">
                    <li className="flex items-start gap-2">
                      <span className="shrink-0 font-semibold text-white">
                        1.
                      </span>
                      <span>Install the cmux GitHub App on your account</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="shrink-0 font-semibold text-white">
                        2.
                      </span>
                      <span>Grant access to your repositories</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="shrink-0 font-semibold text-white">
                        3.
                      </span>
                      <span>Return here to select repos for preview</span>
                    </li>
                  </ol>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-4">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleInstallApp}
                  disabled={isRedirecting}
                  className="inline-flex w-full items-center justify-center gap-3 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-3 text-base font-medium text-white transition-all hover:from-sky-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isRedirecting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Redirecting to GitHub...
                    </>
                  ) : (
                    <>
                      <Github className="h-5 w-5" />
                      Install cmux GitHub App
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (step === "select") {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-white">
            Select repositories
          </h1>
          <p className="mt-2 text-neutral-300">
            Choose which repositories should have automatic PR screenshots
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        <div className="space-y-4">
          {repos.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center">
              <AlertCircle className="mx-auto h-12 w-12 text-amber-400" />
              <h3 className="mt-4 text-lg font-semibold text-white">
                No repositories found
              </h3>
              <p className="mt-2 text-sm text-neutral-300">
                The cmux GitHub App doesn't have access to any repositories. You
                may need to configure repository access in GitHub.
              </p>
              <button
                type="button"
                onClick={handleInstallApp}
                className="mt-6 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
              >
                <Github className="h-4 w-4" />
                Reconfigure GitHub App
              </button>
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
                <div className="space-y-3">
                  {repos.map((repo) => (
                    <label
                      key={repo.full_name}
                      className="flex cursor-pointer items-center gap-4 rounded-lg border border-white/10 bg-neutral-950/50 p-4 transition hover:border-white/20 hover:bg-neutral-950/70"
                    >
                      <input
                        type="checkbox"
                        checked={selectedRepos.includes(repo.full_name)}
                        onChange={() => handleRepoToggle(repo.full_name)}
                        className="h-5 w-5 rounded border-white/20 bg-neutral-800 text-sky-500 focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 focus:ring-offset-neutral-950"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-medium text-white">
                            {repo.full_name}
                          </span>
                          {repo.private && (
                            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
                              Private
                            </span>
                          )}
                        </div>
                        {repo.updated_at && (
                          <span className="text-xs text-neutral-400">
                            Last updated: {new Date(repo.updated_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {selectedRepos.includes(repo.full_name) && (
                        <CheckCircle2 className="h-5 w-5 text-sky-400" />
                      )}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 p-4">
                <div className="text-sm text-neutral-300">
                  {selectedRepos.length} repositor
                  {selectedRepos.length === 1 ? "y" : "ies"} selected
                </div>
                <button
                  type="button"
                  onClick={handleContinue}
                  disabled={selectedRepos.length === 0}
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-sky-500 to-cyan-500 px-6 py-2 text-sm font-semibold text-white transition-all hover:from-sky-600 hover:to-cyan-600 focus:outline-none focus:ring-2 focus:ring-sky-400 focus:ring-offset-2 focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue to configuration
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}
