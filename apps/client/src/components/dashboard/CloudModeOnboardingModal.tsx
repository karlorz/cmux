import { X, Rocket, Settings, PlayCircle } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

interface CloudModeOnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueWithoutEnvironment: () => void;
  teamSlugOrId: string;
  repoFullName: string;
}

export function CloudModeOnboardingModal({
  isOpen,
  onClose,
  onContinueWithoutEnvironment,
  teamSlugOrId,
  repoFullName,
}: CloudModeOnboardingModalProps) {
  const navigate = useNavigate();
  const [isNavigating, setIsNavigating] = useState(false);

  const handleCreateEnvironment = useCallback(async () => {
    setIsNavigating(true);
    try {
      await navigate({
        to: "/$teamSlugOrId/environments/new",
        params: { teamSlugOrId },
        search: {
          step: "select",
          selectedRepos: [repoFullName],
          instanceId: undefined,
          connectionLogin: undefined,
          repoSearch: undefined,
          snapshotId: undefined,
        },
      });
    } catch (error) {
      console.error("Failed to navigate to environment creation", error);
      setIsNavigating(false);
    }
  }, [navigate, teamSlugOrId, repoFullName]);

  const handleContinue = useCallback(() => {
    onContinueWithoutEnvironment();
    onClose();
  }, [onContinueWithoutEnvironment, onClose]);

  const handleDismiss = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={handleDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div
        className="relative w-full max-w-2xl mx-4 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200 transition-colors"
          aria-label="Close dialog"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="shrink-0">
              <div className="h-12 w-12 rounded-full bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                <Rocket className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="onboarding-title"
                className="text-2xl font-semibold text-neutral-900 dark:text-neutral-100"
              >
                Set up your development environment
              </h2>
              <p className="mt-2 text-base text-neutral-600 dark:text-neutral-400 leading-relaxed">
                You're about to run tasks in cloud mode on{" "}
                <span className="font-mono font-semibold text-neutral-900 dark:text-neutral-100">
                  {repoFullName}
                </span>
                . Did you know you can create an environment to make this easier?
              </p>
            </div>
          </div>

          <div className="space-y-4 mb-6">
            <div className="rounded-lg bg-neutral-50 dark:bg-neutral-900 p-4 border border-neutral-200 dark:border-neutral-800">
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-3">
                Environments help you:
              </h3>
              <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                <li className="flex items-start gap-2">
                  <Settings className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      Set up environment variables
                    </strong>{" "}
                    - Store API keys and secrets securely
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <PlayCircle className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      Configure setup scripts
                    </strong>{" "}
                    - Automatically install dependencies and start your dev server
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <Rocket className="h-4 w-4 mt-0.5 shrink-0 text-blue-600 dark:text-blue-400" />
                  <span>
                    <strong className="text-neutral-900 dark:text-neutral-100">
                      Reuse across tasks
                    </strong>{" "}
                    - Configure once, use every time you work on this repo
                  </span>
                </li>
              </ul>
            </div>

            <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 p-4 border border-blue-200 dark:border-blue-900">
              <p className="text-sm text-neutral-700 dark:text-neutral-300">
                <strong className="text-neutral-900 dark:text-neutral-100">Pro tip:</strong>{" "}
                Creating an environment takes just a few minutes and will save you time on every
                future task.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleCreateEnvironment}
              disabled={isNavigating}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg bg-neutral-900 dark:bg-neutral-100 px-6 py-3 text-base font-medium text-white dark:text-neutral-900 transition-colors hover:bg-neutral-800 dark:hover:bg-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isNavigating ? (
                <>
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-white dark:border-neutral-900 border-t-transparent" />
                  <span>Opening...</span>
                </>
              ) : (
                <>
                  <Settings className="h-5 w-5" />
                  <span>Create environment</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleContinue}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 dark:border-neutral-800 px-6 py-3 text-base font-medium text-neutral-700 dark:text-neutral-300 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-neutral-400 focus:ring-offset-2"
            >
              Continue without
            </button>
          </div>

          <p className="mt-4 text-xs text-center text-neutral-500 dark:text-neutral-400">
            This message will only show once per repository
          </p>
        </div>
      </div>
    </div>
  );
}
