import { RepositoryConnectionsSection, type ConnectionContext } from "@/components/RepositoryPicker";
import { GitHubIcon } from "@/components/icons/github";
import { Button } from "@/components/ui/button";
import type { CmuxSocket } from "@/contexts/socket/types";
import type { Doc } from "@cmux/convex/dataModel";
import { useNavigate, useRouter } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowRight, CheckCircle2, Loader2, RefreshCcw, Server, Sparkles } from "lucide-react";

type ProviderConnectionSummary = {
  installationId: number;
  accountLogin?: string | null;
  accountType?: "User" | "Organization" | null;
  type?: string | null;
  isActive?: boolean | null;
};

type StepId = "connect" | "repos" | "environment";

interface TeamOnboardingFlowProps {
  teamSlugOrId: string;
  socket: CmuxSocket | null;
  connections: ProviderConnectionSummary[] | undefined;
  reposByOrg: Record<string, Doc<"repos">[]> | undefined;
  environments: Doc<"environments">[] | undefined;
}

export function TeamOnboardingFlow({
  teamSlugOrId,
  socket,
  connections,
  reposByOrg,
  environments,
}: TeamOnboardingFlowProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const [selectedLogin, setSelectedLogin] = useState<string | null>(null);
  const [connectionContext, setConnectionContext] = useState<ConnectionContext>({
    selectedLogin: null,
    installationId: null,
    hasConnections: false,
  });
  const [isPrimerOpen, setIsPrimerOpen] = useState(false);
  const [isSyncingRepos, setIsSyncingRepos] = useState(false);

  const activeConnections = useMemo(
    () => (connections ?? []).filter((conn) => conn.isActive !== false),
    [connections],
  );

  const repoList = useMemo(() => {
    if (!reposByOrg) return [] as Doc<"repos">[];
    return Object.values(reposByOrg)
      .flat()
      .sort((a, b) => (b.lastPushedAt ?? 0) - (a.lastPushedAt ?? 0));
  }, [reposByOrg]);

  const environmentsCount = environments?.length ?? 0;
  const hasConnections = activeConnections.length > 0;
  const hasRepos = repoList.length > 0;
  const hasEnvironment = environmentsCount > 0;

  const manageUrl = useMemo(() => {
    if (activeConnections.length === 0) return null;
    const first = activeConnections[0];
    if (!first.accountLogin || !first.accountType) return null;
    return first.accountType === "Organization"
      ? `https://github.com/organizations/${first.accountLogin}/settings/installations/${first.installationId}`
      : `https://github.com/settings/installations/${first.installationId}`;
  }, [activeConnections]);

  const steps = useMemo(() => {
    const blueprint: { id: StepId; title: string; description: string; done: boolean }[] = [
      {
        id: "connect",
        title: "Connect GitHub",
        description: "Install the cmux GitHub App for at least one org",
        done: hasConnections,
      },
      {
        id: "repos",
        title: "Sync repositories",
        description: "Pick repos so tasks have code context",
        done: hasRepos,
      },
      {
        id: "environment",
        title: "Create an environment",
        description: "Provision a workspace snapshot for agents",
        done: hasEnvironment,
      },
    ];
    let foundActive = false;
    return blueprint.map((step) => {
      const status = step.done
        ? "complete"
        : foundActive
          ? "waiting"
          : ((foundActive = true), "active");
      return { ...step, status } as const;
    });
  }, [hasConnections, hasEnvironment, hasRepos]);

  const activeStep = steps.find((step) => step.status === "active");
  const onboardingComplete = steps.every((step) => step.status === "complete");

  const queryClient = router.options.context?.queryClient;

  const handleConnectionsInvalidated = useCallback(() => {
    queryClient?.invalidateQueries();
    window?.focus?.();
  }, [queryClient]);

  const handleSyncRepos = useCallback(() => {
    if (!socket) {
      toast.error("Socket unavailable. Restart the cmux daemon and try again.");
      return;
    }
    setIsSyncingRepos(true);
    socket.emit("github-fetch-repos", { teamSlugOrId }, (response: unknown) => {
      setIsSyncingRepos(false);
      if (
        response &&
        typeof response === "object" &&
        "success" in response &&
        (response as { success: boolean }).success
      ) {
        toast.success("Syncing GitHub repositories");
      } else {
        const message =
          response && typeof response === "object" && "error" in response
            ? String((response as { error?: unknown }).error ?? "Failed to sync")
            : "Failed to sync repositories";
        toast.error(message);
      }
    });
  }, [socket, teamSlugOrId]);

  const handleCreateEnvironment = useCallback(() => {
    void navigate({
      to: "/$teamSlugOrId/environments/new",
      params: { teamSlugOrId },
      search: {
        step: "select" as const,
        selectedRepos: [] as string[],
        instanceId: undefined,
        connectionLogin: undefined,
        repoSearch: undefined,
        snapshotId: undefined,
      },
    });
  }, [navigate, teamSlugOrId]);

  const highlightedRepos = repoList.slice(0, 6);

  const renderActivePanel = () => {
    if (onboardingComplete) {
      return (
        <div className="rounded-3xl border border-emerald-200/60 bg-white shadow-[0_25px_60px_rgba(16,185,129,0.08)] p-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-semibold text-neutral-900">You’re ready to ship with cmux</h2>
          <p className="mt-2 text-base text-neutral-600">
            Kick off your first multi-agent task with synced repos and a configured environment.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Button onClick={handleCreateEnvironment}>
              Create another environment
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="ghost" onClick={() => setIsPrimerOpen(true)}>
              Review environment primer
            </Button>
          </div>
        </div>
      );
    }

    if (!activeStep) return null;

    if (activeStep.id === "connect") {
      return (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-6 space-y-2">
            <p className="text-sm font-semibold text-neutral-600">Step 1</p>
            <h2 className="text-2xl font-semibold text-neutral-900">
              Connect the cmux GitHub App
            </h2>
            <p className="text-sm text-neutral-600">
              Install the app on the organization or user account that owns the repos you want cmux to work on.
            </p>
          </div>
          <RepositoryConnectionsSection
            teamSlugOrId={teamSlugOrId}
            selectedLogin={selectedLogin}
            onSelectedLoginChange={setSelectedLogin}
            onContextChange={setConnectionContext}
            onConnectionsInvalidated={handleConnectionsInvalidated}
          />
          <ul className="mt-6 space-y-2 text-sm text-neutral-600">
            <li>
              <span className="font-medium text-neutral-900">Why?</span> cmux needs app-level access so agents can fetch diffs, branches, and PR metadata securely.
            </li>
            <li>
              We mirror the GitHub heatmap onboarding flow—install first, then the rest of the UI unlocks automatically.
            </li>
          </ul>
        </div>
      );
    }

    if (activeStep.id === "repos") {
      return (
        <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-neutral-600">Step 2</p>
              <h2 className="text-2xl font-semibold text-neutral-900">Sync a few repositories</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Grant access to the repos you want agents to work on, then trigger a sync so cmux caches branches and metadata.
              </p>
              {connectionContext.selectedLogin ? (
                <p className="text-xs text-neutral-500">
                  Active installation: {connectionContext.selectedLogin}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              {manageUrl ? (
                <Button asChild variant="ghost">
                  <a href={manageUrl} target="_blank" rel="noreferrer">
                    Manage on GitHub
                  </a>
                </Button>
              ) : null}
              <Button
                onClick={handleSyncRepos}
                disabled={!hasConnections || isSyncingRepos}
                variant="outline"
              >
                {isSyncingRepos ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Syncing
                  </>
                ) : (
                  <>
                    <RefreshCcw className="h-4 w-4" /> Sync now
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-3">
            {highlightedRepos.length > 0 ? (
              highlightedRepos.map((repo) => (
                <div
                  key={repo._id}
                  className="flex items-center justify-between rounded-2xl border border-neutral-200 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100">
                      <GitHubIcon className="h-5 w-5 text-neutral-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-neutral-900">
                        {repo.fullName}
                      </p>
                      <p className="text-xs text-neutral-500">
                        Updated {formatRelativeTime(repo.lastPushedAt)}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-neutral-500">
                    {repo.visibility ?? "private"}
                  </span>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-neutral-300 px-4 py-10 text-center text-sm text-neutral-500">
                No repositories have been synced yet. Use “Manage on GitHub” to add repos to the installation, then run “Sync now”.
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
        <p className="text-sm font-semibold text-neutral-600">Step 3</p>
        <h2 className="mt-1 text-2xl font-semibold text-neutral-900">
          Spin up your first environment
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Environments capture a ready-to-code snapshot (repos, dependencies, tools). Agents fork that snapshot for every task so results are reproducible.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button onClick={handleCreateEnvironment}>
            Create environment now
            <ArrowRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" onClick={() => setIsPrimerOpen(true)}>
            What is an environment?
          </Button>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <PrimerCard
            title="Cloud snapshots"
            body="Start from Morph-managed VM images tuned for AI agents."
            icon={<Server className="h-5 w-5" />}
          />
          <PrimerCard
            title="State you control"
            body="Every run clones your source repos and executes scripts you define so environments stay deterministic."
            icon={<Sparkles className="h-5 w-5" />}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-full bg-neutral-50 dark:bg-neutral-900/30">
      <div className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
            Guided onboarding
          </p>
          <h1 className="text-3xl font-semibold text-neutral-900">
            Let’s get your GitHub flow wired into cmux
          </h1>
          <p className="text-sm text-neutral-600">
            Just like the GitHub PR heatmap experience, we gate the dashboard until GitHub is connected, repos are synced, and a starter environment exists.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[260px,1fr]">
          <aside className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-neutral-600">Progress</h2>
            <ul className="mt-4 space-y-4">
              {steps.map((step) => (
                <li key={step.id} className="flex gap-3">
                  <StepBadge status={step.status} />
                  <div>
                    <p className="text-sm font-semibold text-neutral-900">
                      {step.title}
                    </p>
                    <p className="text-xs text-neutral-500">{step.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          </aside>

          <section>{renderActivePanel()}</section>
        </div>
      </div>

      <EnvironmentPrimerDialog open={isPrimerOpen} onOpenChange={setIsPrimerOpen} />
    </div>
  );
}

function StepBadge({ status }: { status: "complete" | "active" | "waiting" }) {
  if (status === "complete") {
    return (
      <div className="mt-1 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
      </div>
    );
  }

  if (status === "active") {
    return (
      <div className="mt-1 flex h-6 w-6 items-center justify-center">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-neutral-900 opacity-25" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-neutral-900" />
        </span>
      </div>
    );
  }

  return (
    <div className="mt-1 flex h-6 w-6 items-center justify-center">
      <span className="h-2 w-2 rounded-full bg-neutral-300" />
    </div>
  );
}

function PrimerCard({
  title,
  body,
  icon,
}: {
  title: string;
  body: string;
  icon: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-neutral-200 px-4 py-3">
      <div className="flex items-center gap-2 text-neutral-700">{icon}</div>
      <p className="mt-2 text-sm font-semibold text-neutral-900">{title}</p>
      <p className="mt-1 text-xs text-neutral-500">{body}</p>
    </div>
  );
}

function EnvironmentPrimerDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const sections = [
    {
      title: "Snapshots vs. live VMs",
      body: "cmux snapshots are reproducible templates. Every task forks the template so experiments never pollute the base image.",
    },
    {
      title: "Local + cloud continuity",
      body: "Start in Docker for quick iterations, then upload the exact state to cloud morph instances when you need scale.",
    },
    {
      title: "Artifacts + logs",
      body: "Each environment automatically routes build artifacts, screenshots, and terminal logs back into the task timeline.",
    },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[var(--z-overlay)] bg-neutral-950/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[var(--z-modal)] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neutral-200 bg-white p-8 shadow-2xl">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <Dialog.Title className="text-xl font-semibold text-neutral-900">
                Environment primer
              </Dialog.Title>
              <Dialog.Description className="text-sm text-neutral-500">
                What actually happens when you click “Create environment”.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {sections.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-neutral-200 px-4 py-3"
              >
                <p className="text-sm font-semibold text-neutral-900">
                  {section.title}
                </p>
                <p className="text-xs text-neutral-500">{section.body}</p>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Close
            </Button>
            <Button onClick={() => onOpenChange(false)}>
              Got it
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function formatRelativeTime(ts?: number | null): string {
  if (!ts) return "just now";
  const diff = Date.now() - ts;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < day * 30) return `${Math.floor(diff / day)}d ago`;
  const month = day * 30;
  if (diff < month * 12) return `${Math.floor(diff / month)}mo ago`;
  return `${Math.floor(diff / (month * 12))}y ago`;
}
