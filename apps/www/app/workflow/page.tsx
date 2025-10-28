import { SiteHeader } from "@/components/site-header";
import {
  ArrowRight,
  CheckCircle,
  GitBranch,
  GitPullRequest,
  Layers,
  Play,
  Settings,
  Terminal,
  Users,
  Zap,
} from "lucide-react";
import Link from "next/link";
import { fetchLatestRelease } from "@/lib/fetch-latest-release";

const workflowSteps = [
  {
    id: "step-setup",
    title: "1. Set up your environment",
    description: "Configure your workspace and connect repositories",
    icon: Settings,
    content: {
      overview: "Before running agents, set up your development environment and connect your repositories.",
      steps: [
        "Install cmux on your macOS machine",
        "Configure your GitHub integration and API keys",
        "Set up Docker for local development or connect cloud sandboxes",
        "Create or link your repositories in cmux",
      ],
      details: "cmux supports both local Docker environments and cloud sandbox providers. For local development, ensure Docker is running. For cloud environments, configure your preferred sandbox provider in the settings.",
    },
  },
  {
    id: "step-configure",
    title: "2. Configure run context",
    description: "Set up scripts, branches, and agent selection",
    icon: GitBranch,
    content: {
      overview: "Define the context for your agent runs including dev scripts, branches, and which agents to use.",
      steps: [
        "Select the repository and branches to work on",
        "Configure dev and maintenance scripts for your environment",
        "Choose which AI agents to run (Claude Code, Codex, Gemini CLI, etc.)",
        "Set up environment variables and dependencies",
      ],
      details: "The environment configuration tells cmux how to start your dev servers and run tests. You can define custom scripts for different project types, from React apps to Python APIs.",
    },
  },
  {
    id: "step-launch",
    title: "3. Launch agents",
    description: "Start parallel agent execution",
    icon: Play,
    content: {
      overview: "Launch multiple AI agents simultaneously, each in their own isolated workspace.",
      steps: [
        "Click 'Start Run' to launch all selected agents",
        "Each agent gets its own VS Code instance and terminal",
        "Agents begin working on the same task independently",
        "Monitor progress through the cmux dashboard",
      ],
      details: "When you start a run, cmux creates isolated environments for each agent. Each gets a clean git state, dedicated VS Code window, and separate terminal session. This prevents agents from interfering with each other.",
    },
  },
  {
    id: "step-monitor",
    title: "4. Monitor execution",
    description: "Watch agents work in real-time",
    icon: Users,
    content: {
      overview: "Follow each agent's progress through dedicated VS Code instances and terminal outputs.",
      steps: [
        "Switch between agent workspaces to see real-time progress",
        "View terminal output and command history for each agent",
        "Monitor git diffs as they accumulate changes",
        "Check dev server previews when they start",
      ],
      details: "The cmux dashboard shows all active agents with their current status. Green checkmarks indicate completed tasks. You can click into any agent's VS Code instance to see exactly what they're doing.",
    },
  },
  {
    id: "step-review",
    title: "5. Review and verify",
    description: "Examine diffs, tests, and previews",
    icon: GitPullRequest,
    content: {
      overview: "Verify agent work through integrated diff viewers and live previews.",
      steps: [
        "Open the git diff viewer for each agent's changes",
        "Review test results and command outputs",
        "Launch dev server previews to test functionality",
        "Compare approaches between different agents",
      ],
      details: "cmux provides a unified diff viewer that scopes changes to each agent. You can filter by agent, jump between files, and see exactly what changed. Live previews let you test the actual running application.",
    },
  },
  {
    id: "step-ship",
    title: "6. Ship your code",
    description: "Create PRs and merge changes",
    icon: CheckCircle,
    content: {
      overview: "Create pull requests directly from cmux and merge verified changes.",
      steps: [
        "Select the best agent's changes or combine multiple approaches",
        "Create a pull request with verification notes",
        "Review final checks and merge when ready",
        "Track deployment and monitor production",
      ],
      details: "Once you've verified the changes, create a pull request directly from the cmux interface. Include verification notes about what you tested. The crown evaluator can help identify the best implementation across agents.",
    },
  },
];

const keyFeatures = [
  {
    title: "Isolated VS Code instances",
    description: "Each agent runs in its own VS Code workspace with dedicated terminals and git state.",
    icon: Layers,
  },
  {
    title: "Parallel execution",
    description: "Run multiple AI agents simultaneously on the same or different tasks.",
    icon: Users,
  },
  {
    title: "Unified diff viewer",
    description: "Review all agent changes in one place with filtering and comparison tools.",
    icon: GitPullRequest,
  },
  {
    title: "Live dev previews",
    description: "Test agent changes with automatically started development servers.",
    icon: Zap,
  },
  {
    title: "Cloud or local",
    description: "Choose between cloud sandboxes or local Docker containers for isolation.",
    icon: Terminal,
  },
];

export default async function WorkflowPage() {
  const { fallbackUrl, latestVersion, macDownloadUrls } =
    await fetchLatestRelease();

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#030712] text-foreground">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute inset-x-[-20%] top-[-30%] h-[40rem] rounded-full bg-gradient-to-br from-blue-600/30 via-sky-500/20 to-purple-600/10 blur-3xl" />
        <div className="absolute inset-x-[30%] top-[20%] h-[30rem] rounded-full bg-gradient-to-br from-cyan-400/20 via-sky-500/20 to-transparent blur-[160px]" />
        <div className="absolute inset-x-[10%] bottom-[-20%] h-[32rem] rounded-full bg-gradient-to-tr from-indigo-500/20 via-blue-700/10 to-transparent blur-[200px]" />
      </div>

      <SiteHeader
        fallbackUrl={fallbackUrl}
        latestVersion={latestVersion}
        macDownloadUrls={macDownloadUrls}
      />

      <main className="relative z-10 flex-1">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-16 sm:px-6 sm:pb-24 sm:pt-12">
          <div className="space-y-8 text-center">
            <div className="space-y-4">
              <h1 className="text-4xl font-semibold tracking-tight text-white sm:text-5xl">
                How to use cmux
              </h1>
              <p className="mx-auto max-w-3xl text-lg text-neutral-300">
                A complete guide to running AI coding agents in parallel with cmux.
                From setup to shipping, learn how to maximize productivity with multiple AI assistants.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-black shadow-xl transition hover:bg-neutral-100"
                href="/"
              >
                <span>← Back to home</span>
              </Link>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                href="https://github.com/manaflow-ai/cmux"
              >
                View on GitHub
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="space-y-12">
            <div className="space-y-3 text-center">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                Key features that enable parallel AI development
              </h2>
              <p className="mx-auto max-w-3xl text-sm text-neutral-400 sm:text-base">
                cmux provides the infrastructure needed to run multiple AI agents safely and efficiently.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {keyFeatures.map(({ icon: Icon, title, description }) => (
                <div
                  key={title}
                  className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 p-6 transition hover:border-white/20 hover:bg-white/10"
                >
                  <div className="flex items-start gap-4">
                    <div className="rounded-xl bg-gradient-to-br from-sky-500/40 via-blue-500/40 to-purple-500/40 p-3 text-white shadow-lg">
                      <Icon className="h-5 w-5" aria-hidden />
                    </div>
                    <div className="space-y-2">
                      <h3 className="text-base font-semibold text-white">{title}</h3>
                      <p className="text-sm text-neutral-300">{description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
          <div className="space-y-12">
            <div className="space-y-3 text-center">
              <h2 className="text-2xl font-semibold text-white sm:text-3xl">
                The complete cmux workflow
              </h2>
              <p className="mx-auto max-w-3xl text-sm text-neutral-400 sm:text-base">
                Follow these steps to get started with running AI agents in parallel.
              </p>
            </div>
            <div className="space-y-8">
              {workflowSteps.map((step, index) => {
                const Icon = step.icon;
                return (
                  <article
                    key={step.id}
                    className="relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/80 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                  >
                    <div className="grid gap-8 lg:grid-cols-[1fr_2fr]">
                      <div className="space-y-4">
                        <div className="flex items-center gap-4">
                          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-sky-500/40 to-indigo-500/40 text-white shadow-lg">
                            <Icon className="h-6 w-6" />
                          </div>
                          <div>
                            <h3 className="text-xl font-semibold text-white">
                              {step.title}
                            </h3>
                            <p className="text-sm text-neutral-400">
                              {step.description}
                            </p>
                          </div>
                        </div>
                        <div className="space-y-3">
                          <p className="text-sm text-neutral-300">
                            {step.content.overview}
                          </p>
                          <ul className="space-y-2">
                            {step.content.steps.map((item, itemIndex) => (
                              <li
                                key={itemIndex}
                                className="flex items-start gap-3 text-sm text-neutral-300"
                              >
                                <div className="mt-0.5 h-5 w-5 flex-none rounded-full bg-sky-500/20 text-center text-xs font-semibold leading-5 text-sky-300">
                                  {itemIndex + 1}
                                </div>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="space-y-3">
                        <h4 className="text-sm font-semibold text-white">Details</h4>
                        <p className="text-sm text-neutral-400 leading-relaxed">
                          {step.content.details}
                        </p>
                      </div>
                    </div>
                    {index < workflowSteps.length - 1 && (
                      <div className="absolute -bottom-4 left-1/2 h-8 w-px -translate-x-1/2 bg-gradient-to-b from-white/20 to-transparent" />
                    )}
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-4 pb-20 text-center sm:px-6">
          <div className="space-y-6 rounded-3xl border border-white/10 bg-white/5 p-8">
            <h2 className="text-2xl font-semibold text-white">Ready to get started?</h2>
            <p className="text-sm text-neutral-400">
              Download cmux and start running AI agents in parallel today.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/20 bg-white px-4 py-3 text-sm font-semibold text-black shadow-xl transition hover:bg-neutral-100"
                href="/"
              >
                Download cmux
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:border-white/30 hover:bg-white/10"
                href="https://github.com/manaflow-ai/cmux"
              >
                View documentation
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}