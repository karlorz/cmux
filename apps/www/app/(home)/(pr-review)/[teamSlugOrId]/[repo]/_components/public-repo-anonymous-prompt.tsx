"use client";

import { useCallback, useState } from "react";
import { Eye, LogIn } from "lucide-react";

interface PublicRepoAnonymousPromptProps {
  teamSlugOrId: string;
  repo: string;
  githubOwner: string;
  pullNumber: number;
}

/**
 * Prompt shown to anonymous users viewing a public repository.
 * Allows them to sign in anonymously to access the PR review features.
 */
export function PublicRepoAnonymousPrompt({
  teamSlugOrId,
  repo,
  githubOwner,
  pullNumber,
}: PublicRepoAnonymousPromptProps) {
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAnonymousSignIn = useCallback(async () => {
    setIsSigningIn(true);
    setError(null);

    try {
      const currentUrl = window.location.href;

      // Store return URL in session storage
      try {
        sessionStorage.setItem("pr_review_return_url", currentUrl);
      } catch (storageError) {
        console.warn(
          "[PublicRepoAnonymousPrompt] Failed to persist return URL",
          storageError
        );
      }

      // TODO: Implement anonymous user sign-in flow with Stack Auth
      // For now, redirect to sign-in page with return URL
      const returnTo = encodeURIComponent(window.location.pathname);
      window.location.href = `/sign-in?after_auth_return_to=${returnTo}`;
    } catch (err) {
      console.error(
        "[PublicRepoAnonymousPrompt] Failed to initiate anonymous sign-in",
        err
      );
      setError("An unexpected error occurred. Please try again.");
      setIsSigningIn(false);
    }
  }, []);

  const handleRegularSignIn = useCallback(() => {
    const returnTo = encodeURIComponent(window.location.pathname);
    window.location.href = `/sign-in?after_auth_return_to=${returnTo}`;
  }, []);

  return (
    <div className="min-h-dvh bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100 flex items-center justify-center px-6">
      <div className="max-w-2xl w-full">
        <div className="rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 p-8 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <Eye className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                Public Repository Access
              </h1>
              <p className="mt-3 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
                You're viewing a public repository
                <span className="mx-1 font-mono font-medium text-neutral-900 dark:text-neutral-100">
                  {githubOwner}/{repo}
                </span>
                (PR #{pullNumber}). Sign in to access code review features.
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800">
                  <h2 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-2">
                    What you can do:
                  </h2>
                  <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                    <li className="flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span>View pull request changes and diffs</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span>Browse code review insights</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="shrink-0">•</span>
                      <span>Access all public repository features</span>
                    </li>
                  </ul>
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 p-4">
                    <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
                  </div>
                )}

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleAnonymousSignIn}
                    disabled={isSigningIn}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-lg bg-blue-600 dark:bg-blue-500 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-blue-700 dark:hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isSigningIn ? (
                      <>
                        <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        <span>Signing in…</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-5 w-5" />
                        <span>Continue as Guest</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleRegularSignIn}
                    disabled={isSigningIn}
                    className="w-full inline-flex items-center justify-center gap-3 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-6 py-3 text-base font-medium text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 dark:focus:ring-offset-neutral-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <LogIn className="h-5 w-5" />
                    <span>Sign In with GitHub</span>
                  </button>
                </div>

                <p className="text-xs text-center text-neutral-500 dark:text-neutral-400">
                  Guest access allows you to view public repositories without an account.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
