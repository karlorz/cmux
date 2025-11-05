import { env } from "@/client-env";
import { Button } from "@/components/ui/button";
import { api } from "@cmux/convex/api";
import { useNavigate } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery } from "convex/react";
import {
  ArrowRight,
  CheckCircle2,
  GitBranch,
  Plug,
  Rocket,
  Server,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { isElectron } from "@/lib/electron";
import { cn } from "@/lib/utils";

const storageKeyForTeam = (teamSlugOrId: string) =>
  `cmux:onboarding-dismissed:${teamSlugOrId}`;

interface TeamOnboardingOverlayProps {
  teamSlugOrId: string;
}

export function TeamOnboardingOverlay({
  teamSlugOrId,
}: TeamOnboardingOverlayProps) {
  const connections = useQuery(api.github.listProviderConnections, {
    teamSlugOrId,
  });
  const environments = useQuery(api.environments.list, { teamSlugOrId });
  const mintState = useMutation(api.github_app.mintInstallState);
  const navigate = useNavigate();

  const activeConnections = useMemo(
    () => (connections || []).filter((connection) => connection.isActive !== false),
    [connections]
  );
  const hasConnections = activeConnections.length > 0;
  const hasEnvironment = (environments?.length ?? 0) > 0;

  const storageKey = storageKeyForTeam(teamSlugOrId);
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(storageKey) === "1";
  });
  const [explainerOpen, setExplainerOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const markDismissed = useCallback(() => {
    setIsDismissed(true);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, "1");
    }
  }, [storageKey]);

  useEffect(() => {
    if (hasConnections && hasEnvironment && !isDismissed) {
      markDismissed();
    }
  }, [hasConnections, hasEnvironment, isDismissed, markDismissed]);

  const installNewUrl = env.NEXT_PUBLIC_GITHUB_APP_SLUG
    ? `https://github.com/apps/${env.NEXT_PUBLIC_GITHUB_APP_SLUG}/installations/new`
    : null;

  const watchPopupClosed = useCallback((popup: Window | null, onClose?: () => void) => {
    if (typeof window === "undefined" || !popup) return;
    const timer = window.setInterval(() => {
      try {
        if (popup.closed) {
          window.clearInterval(timer);
          onClose?.();
        }
      } catch (_error) {
        window.clearInterval(timer);
        onClose?.();
      }
    }, 600);
  }, []);

  const openCenteredPopup = useCallback(
    (
      url: string,
      opts?: { name?: string; width?: number; height?: number },
      onClose?: () => void
    ): Window | null => {
      if (typeof window === "undefined") {
        return null;
      }
      if (isElectron) {
        window.open(url, "_blank", "noopener,noreferrer");
        onClose?.();
        return null;
      }
      const name = opts?.name ?? "cmux-github-install";
      const width = Math.floor(opts?.width ?? 980);
      const height = Math.floor(opts?.height ?? 780);
      const dualScreenLeft = window.screenLeft ?? window.screenX ?? 0;
      const dualScreenTop = window.screenTop ?? window.screenY ?? 0;
      const outerWidth = window.outerWidth || window.innerWidth || width;
      const outerHeight = window.outerHeight || window.innerHeight || height;
      const left = Math.max(0, dualScreenLeft + (outerWidth - width) / 2);
      const top = Math.max(0, dualScreenTop + (outerHeight - height) / 2);
      const features = [
        `width=${width}`,
        `height=${height}`,
        `left=${Math.floor(left)}`,
        `top=${Math.floor(top)}`,
        "resizable=yes",
        "scrollbars=yes",
        "toolbar=no",
        "location=no",
        "status=no",
        "menubar=no",
      ].join(",");

      const popup = window.open("about:blank", name, features);
      if (popup) {
        try {
          (popup as Window & { opener: Window | null }).opener = null;
        } catch (_error) {
          // Ignore cross-origin failures and continue.
        }
        try {
          popup.location.href = url;
        } catch (_error) {
          window.open(url, "_blank");
        }
        popup.focus?.();
        watchPopupClosed(popup, onClose);
        return popup;
      }
      const fallback = window.open(url, "_blank");
      watchPopupClosed(fallback, onClose);
      return fallback;
    },
    [watchPopupClosed]
  );

  const handleConnectGithub = useCallback(async () => {
    if (!installNewUrl) {
      toast.error("The cmux GitHub App isn't configured yet.");
      return;
    }
    setIsConnecting(true);
    try {
      const { state } = await mintState({ teamSlugOrId });
      const sep = installNewUrl.includes("?") ? "&" : "?";
      const url = `${installNewUrl}${sep}state=${encodeURIComponent(state)}`;
      openCenteredPopup(url, { name: "github-install" }, () => {
        toast.success("GitHub access updated. Pick repos to finish onboarding.");
      });
    } catch (error) {
      console.error("[onboarding] Failed to start GitHub install", error);
      toast.error("Couldn't open the GitHub install flow. Try again.");
    } finally {
      setIsConnecting(false);
    }
  }, [installNewUrl, mintState, openCenteredPopup, teamSlugOrId]);

  const goToEnvironmentBuilder = useCallback(() => {
    markDismissed();
    void navigate({
      to: "/$teamSlugOrId/environments/new",
      params: { teamSlugOrId },
      search: {
        step: undefined,
        selectedRepos: undefined,
        connectionLogin: undefined,
        repoSearch: undefined,
        instanceId: undefined,
        snapshotId: undefined,
      },
    });
  }, [markDismissed, navigate, teamSlugOrId]);

  const checklist: ChecklistItem[] = [
    {
      label: "Connect GitHub",
      description: "Install the cmux GitHub App for at least one org or user.",
      complete: hasConnections,
    },
    {
      label: "Sync repos",
      description: "Pick repos so we can build a reusable environment snapshot.",
      complete: hasEnvironment,
    },
  ];

  const shouldShowOverlay =
    !isDismissed && (!hasConnections || !hasEnvironment);

  if (!shouldShowOverlay) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[var(--z-global-blocking)]">
      <div className="absolute inset-0 bg-neutral-950/70 backdrop-blur-sm" />
      <div className="relative h-full w-full flex items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-5xl rounded-3xl border border-white/15 bg-white/95 shadow-2xl ring-1 ring-black/5 backdrop-blur-sm dark:bg-neutral-950/95 dark:border-neutral-800">
          <div className="px-6 py-5 sm:px-10 sm:py-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-neutral-500 dark:text-neutral-400">
                  Welcome to cmux
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">
                  Let’s connect GitHub and prepare your first environment
                </h1>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  We’ll use your repositories to create cloud dev surfaces so you
                  can launch tasks instantly. Complete the checklist below to get
                  started.
                </p>
              </div>
              <div className="flex gap-2 self-end sm:self-start">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markDismissed}
                  className="text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
                >
                  Skip for now
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setExplainerOpen(true)}
                >
                  How cmux works
                </Button>
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[2fr,1fr]">
              <div className="space-y-4">
                <SetupStepCard
                  step={1}
                  title="Connect GitHub"
                  description="Install the cmux GitHub App so we can watch PRs and pull your repos on demand."
                  icon={<Plug className="w-5 h-5" />}
                  complete={hasConnections}
                  action=
                    {hasConnections ? (
                      <Button variant="secondary" size="sm" className="cursor-default" disabled>
                        <CheckCircle2 className="w-4 h-4" />
                        Connected
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleConnectGithub}
                        disabled={isConnecting}
                      >
                        {isConnecting ? "Opening GitHub…" : "Connect GitHub"}
                      </Button>
                    )}
                />

                <SetupStepCard
                  step={2}
                  title="Select repositories"
                  description="Choose the repos cmux should clone into your shared environment."
                  icon={<GitBranch className="w-5 h-5" />}
                  complete={hasEnvironment}
                  action={
                    <Button size="sm" onClick={goToEnvironmentBuilder}>
                      Choose repos
                      <ArrowRight className="w-4 h-4" />
                    </Button>
                  }
                />
              </div>

              <div className="rounded-2xl border border-neutral-200/80 bg-white/60 p-5 shadow-inner dark:border-neutral-800 dark:bg-neutral-900/80">
                <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Onboarding checklist
                </h3>
                <ul className="mt-4 space-y-3">
                  {checklist.map((item) => (
                    <ChecklistRow key={item.label} {...item} />
                  ))}
                </ul>
                <div className="mt-4 rounded-xl bg-neutral-900 text-white p-4 text-sm dark:bg-white dark:text-neutral-900">
                  <p className="font-medium">What’s a cmux environment?</p>
                  <p className="mt-1 text-white/80 dark:text-neutral-700">
                    It’s a reusable cloud workspace that keeps your repos, packages,
                    and agent preferences pinned so every task starts ready-to-code.
                  </p>
                  <button
                    type="button"
                    onClick={() => setExplainerOpen(true)}
                    className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/80 underline underline-offset-4 dark:text-neutral-800"
                  >
                    Learn more
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <OnboardingExplainerDialog open={explainerOpen} onOpenChange={setExplainerOpen} />
    </div>
  );
}

interface ChecklistItem {
  label: string;
  description: string;
  complete: boolean;
}

function ChecklistRow({ label, description, complete }: ChecklistItem) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={cn(
          "mt-1 inline-flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold",
          complete
            ? "border-emerald-500 bg-emerald-500/10 text-emerald-500"
            : "border-neutral-300 text-neutral-400 dark:border-neutral-700"
        )}
      >
        {complete ? "✓" : "•"}
      </span>
      <div>
        <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {label}
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
      </div>
    </li>
  );
}

interface SetupStepCardProps {
  step: number;
  title: string;
  description: string;
  icon: ReactNode;
  action?: ReactNode;
  complete?: boolean;
}

function SetupStepCard({
  step,
  title,
  description,
  icon,
  action,
  complete = false,
}: SetupStepCardProps) {
  return (
    <div className="rounded-2xl border border-neutral-200/80 bg-white/80 p-5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/80">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
          {icon}
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-neutral-500 dark:text-neutral-500">
            Step {step}
          </p>
          <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            {title}
          </h2>
        </div>
      </div>
      <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">{description}</p>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
          {complete ? "Complete" : "Required"}
        </div>
        <div className="flex items-center gap-2">{action}</div>
      </div>
    </div>
  );
}

interface OnboardingExplainerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function OnboardingExplainerDialog({
  open,
  onOpenChange,
}: OnboardingExplainerDialogProps) {
  const explainerCards = [
    {
      title: "Connect your sources",
      body: "We install a GitHub App on the orgs or personal accounts you choose. cmux only watches the repos you grant.",
      icon: <Plug className="w-5 h-5" />,
    },
    {
      title: "Capture a cloud environment",
      body: "Pick the repos to clone and we’ll provision a ready-to-code snapshot with dependencies, ports, and scripts.",
      icon: <Server className="w-5 h-5" />,
    },
    {
      title: "Launch tasks instantly",
      body: "Every agent run or workspace launch reuses that snapshot so you skip setup and dive straight into the work.",
      icon: <Rocket className="w-5 h-5" />,
    },
  ];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-neutral-950/60 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-3xl border border-neutral-200 bg-white p-6 shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-semibold text-neutral-900 dark:text-neutral-50">
                How cmux environments work
              </Dialog.Title>
              <Dialog.Description className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                A quick primer on what happens after you connect GitHub and why we
                guide you through repository setup first.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                className="rounded-full border border-neutral-200 p-2 text-neutral-500 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {explainerCards.map((card) => (
              <div
                key={card.title}
                className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                  {card.icon}
                </div>
                <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  {card.title}
                </h3>
                <p className="mt-2 text-xs text-neutral-600 dark:text-neutral-400">
                  {card.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl border border-neutral-200 bg-white p-5 shadow-inner dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <GitBranch className="w-5 h-5 text-neutral-500" />
              <div>
                <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                  Why repos first?
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Agents inherit repo context, secrets, and deployment ports straight from
                  your environment snapshot. No repos, no context.
                </p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-xs text-neutral-600 dark:text-neutral-400">
              <li>• Your repos stay inside a hardened Morph VM with audit logs.</li>
              <li>• Snapshots capture dependencies, scripts, and exposed ports.</li>
              <li>• You can version multiple environments per team for different stacks.</li>
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
