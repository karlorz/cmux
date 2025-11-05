import { Button } from "@/components/ui/button";
import { Check, Rocket, Box, Github, FolderGit2, ExternalLink } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface CompleteStepProps {
  onComplete: () => void;
  teamSlugOrId: string;
  hasGitHubConnection: boolean;
  repoCount: number;
}

export function CompleteStep({
  onComplete,
  teamSlugOrId,
  hasGitHubConnection,
  repoCount,
}: CompleteStepProps) {
  const navigate = useNavigate();

  const handleGoToDashboard = () => {
    onComplete();
    navigate({
      to: "/$teamSlugOrId",
      params: { teamSlugOrId },
    });
  };

  const handleCreateEnvironment = () => {
    onComplete();
    navigate({
      to: "/$teamSlugOrId/environments/new",
      params: { teamSlugOrId },
      search: {
        step: "select" as const,
        selectedRepos: [],
        connectionLogin: undefined,
        repoSearch: undefined,
        instanceId: undefined,
        snapshotId: undefined,
      },
    });
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-emerald-500 shadow-lg shadow-green-500/20">
        <Check className="h-10 w-10 text-white" strokeWidth={3} />
      </div>

      <h2 className="mb-3 text-3xl font-bold text-neutral-900 dark:text-neutral-50">
        You're All Set!
      </h2>

      <p className="mb-8 max-w-2xl text-lg text-neutral-600 dark:text-neutral-400">
        Congratulations! You've completed the onboarding process. Here's what you've accomplished:
      </p>

      <div className="mb-10 w-full max-w-2xl space-y-3">
        <StatusItem
          icon={Github}
          title="GitHub Connection"
          status={hasGitHubConnection}
          description={
            hasGitHubConnection
              ? "Your GitHub account is connected and ready to use"
              : "You can connect GitHub later from your settings"
          }
        />
        <StatusItem
          icon={FolderGit2}
          title="Repository Sync"
          status={repoCount > 0}
          description={
            repoCount > 0
              ? `${repoCount} ${repoCount === 1 ? "repository" : "repositories"} synced and ready`
              : "You can sync repositories when you create your first environment"
          }
        />
        <StatusItem
          icon={Box}
          title="Environments"
          status={false}
          description="Create your first environment to start building"
          optional
        />
      </div>

      <div className="mb-6 w-full max-w-2xl rounded-xl border border-blue-200 bg-blue-50 p-6 text-left dark:border-blue-900/50 dark:bg-blue-900/20">
        <h3 className="mb-2 flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
          <Rocket className="h-5 w-5" />
          Next Steps
        </h3>
        <ul className="space-y-2 text-sm text-blue-800 dark:text-blue-200">
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-600 dark:text-blue-400">•</span>
            <span>
              Create an environment to define where your agents will work
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-600 dark:text-blue-400">•</span>
            <span>
              Create your first task with a description of what you want to build
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-600 dark:text-blue-400">•</span>
            <span>
              Watch as multiple agents work in parallel to create solutions
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5 text-blue-600 dark:text-blue-400">•</span>
            <span>
              Review the results in VSCode and merge the best solution
            </span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={handleCreateEnvironment} className="gap-2">
          <Box className="h-5 w-5" />
          Create Your First Environment
        </Button>
        <Button
          size="lg"
          variant="outline"
          onClick={handleGoToDashboard}
          className="gap-2"
        >
          Go to Dashboard
          <ExternalLink className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function StatusItem({
  icon: Icon,
  title,
  status,
  description,
  optional = false,
}: {
  icon: typeof Github;
  title: string;
  status: boolean;
  description: string;
  optional?: boolean;
}) {
  return (
    <div
      className={`flex items-start gap-4 rounded-xl border p-4 ${
        status
          ? "border-green-200 bg-green-50 dark:border-green-900/50 dark:bg-green-900/20"
          : optional
            ? "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900/50"
            : "border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-900/20"
      }`}
    >
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg ${
          status
            ? "bg-green-500 text-white"
            : optional
              ? "bg-neutral-200 dark:bg-neutral-700"
              : "bg-amber-500 text-white"
        }`}
      >
        {status ? <Check className="h-5 w-5" /> : <Icon className="h-5 w-5" />}
      </div>
      <div className="flex-1 text-left">
        <div className="flex items-center gap-2">
          <h3
            className={`font-semibold ${
              status
                ? "text-green-900 dark:text-green-100"
                : optional
                  ? "text-neutral-900 dark:text-neutral-100"
                  : "text-amber-900 dark:text-amber-100"
            }`}
          >
            {title}
          </h3>
          {optional && (
            <span className="rounded bg-neutral-200 px-2 py-0.5 text-xs font-medium text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400">
              Optional
            </span>
          )}
        </div>
        <p
          className={`mt-1 text-sm ${
            status
              ? "text-green-700 dark:text-green-300"
              : optional
                ? "text-neutral-600 dark:text-neutral-400"
                : "text-amber-700 dark:text-amber-300"
          }`}
        >
          {description}
        </p>
      </div>
    </div>
  );
}
