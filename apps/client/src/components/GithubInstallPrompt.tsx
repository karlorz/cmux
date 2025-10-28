"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";
import { useUser } from "@stackframe/react";

import { env } from "@/client-env";
import { isElectron } from "@/lib/electron";
import { api } from "@cmux/convex/api";

const STORAGE_PREFIX = "cmux.githubInstallPromptSeen";

function buildStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}:${userId}`;
}

function markPromptSeen(userId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildStorageKey(userId), "true");
}

function hasPromptBeenSeen(userId: string): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(buildStorageKey(userId)) === "true";
}

export function GithubInstallPrompt({
  teamSlugOrId,
}: {
  teamSlugOrId: string;
}) {
  const user = useUser({ or: "return-null" });
  const [shouldShow, setShouldShow] = useState(false);
  const [isStartingInstall, setIsStartingInstall] = useState(false);
  const connections = useQuery(api.github.listProviderConnections, {
    teamSlugOrId,
  });
  const mintState = useMutation(api.github_app.mintInstallState);

  const hasActiveConnection = useMemo(() => {
    if (!Array.isArray(connections)) return false;
    return connections.some((connection) => connection?.isActive !== false);
  }, [connections]);

  const installBaseUrl = useMemo(() => {
    const slug = env.NEXT_PUBLIC_GITHUB_APP_SLUG;
    if (!slug) return null;
    return `https://github.com/apps/${slug}/installations/new`;
  }, []);

  const stopShowing = useCallback(() => {
    if (!user) return;
    markPromptSeen(user.id);
    setShouldShow(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setShouldShow(false);
      return;
    }
    if (!installBaseUrl) {
      setShouldShow(false);
      return;
    }
    if (connections === undefined) return;
    if (hasActiveConnection) {
      markPromptSeen(user.id);
      setShouldShow(false);
      return;
    }
    const alreadySeen = hasPromptBeenSeen(user.id);
    setShouldShow(!alreadySeen);
  }, [connections, hasActiveConnection, installBaseUrl, user]);

  useEffect(() => {
    if (!user) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (data && typeof data === "object" && "type" in data) {
        const type = (data as { type?: unknown }).type;
        if (type === "cmux/github-install-complete") {
          stopShowing();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [stopShowing, user]);

  const disableInstall = !installBaseUrl || isStartingInstall;

  const handleOpenInstall = useCallback(async () => {
    if (!user) return;
    if (!installBaseUrl) {
      console.error("GitHub App slug is not configured; cannot start install");
      return;
    }
    setIsStartingInstall(true);
    try {
      const { state } = await mintState({ teamSlugOrId });
      const separator = installBaseUrl.includes("?") ? "&" : "?";
      const installUrl = `${installBaseUrl}${separator}state=${encodeURIComponent(
        state,
      )}`;

      if (isElectron) {
        window.open(installUrl, "_blank", "noopener,noreferrer");
      } else {
        const popup = window.open(
          installUrl,
          "_blank",
          "noopener,noreferrer",
        );
        if (!popup) {
          window.location.href = installUrl;
        } else {
          popup.focus?.();
        }
      }

      markPromptSeen(user.id);
      setShouldShow(false);
    } catch (error) {
      console.error("Failed to start GitHub installation", error);
    } finally {
      setIsStartingInstall(false);
    }
  }, [installBaseUrl, mintState, teamSlugOrId, user]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div className="relative overflow-hidden rounded-lg border border-neutral-200 bg-white p-4 text-sm shadow-sm dark:border-neutral-800 dark:bg-neutral-950 md:flex md:items-center md:justify-between">
        <div className="flex items-start gap-3 pr-10 md:pr-0">
          <div className="mt-0.5 rounded-full border border-amber-200 bg-amber-100/70 p-1 text-amber-700 dark:border-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              Connect GitHub to install the cmux agent
            </p>
            <p className="text-neutral-600 dark:text-neutral-400">
              Install the cmux GitHub app to select the repositories you want
              to work with. This makes them available in cmux without extra
              setup.
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 md:mt-0 md:shrink-0">
          <button
            type="button"
            onClick={handleOpenInstall}
            disabled={disableInstall}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
          >
            {isStartingInstall ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Connect GitHub
          </button>
          <button
            type="button"
            onClick={stopShowing}
            className="inline-flex items-center justify-center gap-1 rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900"
          >
            Not now
          </button>
        </div>
        <button
          type="button"
          onClick={stopShowing}
          className="absolute right-2 top-2 inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-900 dark:hover:text-neutral-200"
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
