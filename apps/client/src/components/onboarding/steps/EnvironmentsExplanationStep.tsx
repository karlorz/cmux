import { Button } from "@/components/ui/button";
import { ArrowRight, Box, Code, GitBranch, Play, Terminal } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

interface EnvironmentsExplanationStepProps {
  onNext: () => void;
  teamSlugOrId: string;
}

export function EnvironmentsExplanationStep({
  onNext,
  teamSlugOrId,
}: EnvironmentsExplanationStepProps) {
  const navigate = useNavigate();

  const handleCreateEnvironment = () => {
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
    <div className="flex flex-col">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Understanding Environments
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          Environments are isolated development spaces where your coding agents work on tasks.
        </p>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <InfoCard
          icon={Box}
          title="Isolated Workspaces"
          description="Each environment runs in its own isolated container with VSCode, ensuring no conflicts between tasks."
        />
        <InfoCard
          icon={GitBranch}
          title="Git Integration"
          description="Automatically creates branches, commits changes, and opens pull requests for review."
        />
        <InfoCard
          icon={Terminal}
          title="Custom Scripts"
          description="Configure maintenance and dev scripts to set up dependencies and run your development server."
        />
        <InfoCard
          icon={Play}
          title="Multiple Agents"
          description="Run Claude Code, Codex CLI, and other agents in parallel across different tasks."
        />
      </div>

      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-6 dark:border-blue-900/50 dark:bg-blue-900/20">
        <h3 className="mb-3 flex items-center gap-2 font-semibold text-blue-900 dark:text-blue-100">
          <Code className="h-5 w-5" />
          How It Works
        </h3>
        <ol className="space-y-3 text-sm text-blue-800 dark:text-blue-200">
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 font-semibold text-blue-900 dark:bg-blue-800 dark:text-blue-100">
              1
            </span>
            <span>
              <strong>Create an environment</strong> by selecting repositories and configuring scripts
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 font-semibold text-blue-900 dark:bg-blue-800 dark:text-blue-100">
              2
            </span>
            <span>
              <strong>Create tasks</strong> with descriptions of what you want to build or fix
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 font-semibold text-blue-900 dark:bg-blue-800 dark:text-blue-100">
              3
            </span>
            <span>
              <strong>Agents work in parallel</strong> creating multiple solutions for each task
            </span>
          </li>
          <li className="flex gap-3">
            <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-blue-200 font-semibold text-blue-900 dark:bg-blue-800 dark:text-blue-100">
              4
            </span>
            <span>
              <strong>Review & merge</strong> the best solution directly from the VSCode interface
            </span>
          </li>
        </ol>
      </div>

      <div className="mb-6 rounded-xl border border-neutral-200 bg-gradient-to-br from-neutral-50 to-white p-6 dark:border-neutral-800 dark:from-neutral-900/50 dark:to-neutral-900">
        <h3 className="mb-3 font-semibold text-neutral-900 dark:text-neutral-100">
          Ready to Create Your First Environment?
        </h3>
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          You can create an environment now, or finish onboarding and create one later from your dashboard.
        </p>
        <Button
          variant="outline"
          onClick={handleCreateEnvironment}
          className="gap-2"
        >
          <Box className="h-4 w-4" />
          Create Environment Now
        </Button>
      </div>

      <div className="flex items-center justify-end pt-4">
        <Button onClick={onNext} className="gap-2">
          Continue
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function InfoCard({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Box;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900/50">
      <div className="mb-2 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h3 className="font-semibold text-neutral-900 dark:text-neutral-100">
          {title}
        </h3>
      </div>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">
        {description}
      </p>
    </div>
  );
}
