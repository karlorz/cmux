"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Loader2, X } from "lucide-react";
import { useMutation, useQuery } from "convex/react";

import { api } from "@cmux/convex/api";
import { env } from "@/lib/utils/www-env";

const STORAGE_PREFIX = "cmux.githubInstallOwnerPromptSeen";

function buildStorageKey(userId: string, owner: string): string {
  return `${STORAGE_PREFIX}:${userId}:${owner.toLowerCase()}`;
}

function markSeen(userId: string, owner: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(buildStorageKey(userId, owner), "true");
}

function wasSeen(userId: string, owner: string): boolean {
  if (typeof window === "undefined") return true;
  return (
    window.localStorage.getItem(buildStorageKey(userId, owner)) === "true"
  );
}

export function InstallAgentPrompt({
  teamSlugOrId,
  owner,
  userId,
  repoFullName,
}: {
  teamSlugOrId: string;
  owner: string;
  userId: string | null;
  repoFullName: string;
}) {
  const [shouldShow, setShouldShow] = useState(false);
  const [isStartingInstall, setIsStartingInstall] = useState(false);

  const connections = useQuery(api.github.listProviderConnections, {
    teamSlugOrId,
  });
  const mintState = useMutation(api.github_app.mintInstallState);

  const hasConnectionForOwner = useMemo(() => {
    if (!Array.isArray(connections)) return false;
    const ownerLower = owner.toLowerCase();
    return connections.some(
      (connection) =>
        connection?.isActive !== false &&
        typeof connection?.accountLogin === "string" &&
        connection.accountLogin.toLowerCase() === ownerLower,
    );
  }, [connections, owner]);

  const installBaseUrl = useMemo(() => {
    const slug = env.NEXT_PUBLIC_GITHUB_APP_SLUG;
    if (!slug) return null;
    return `https://github.com/apps/${slug}/installations/new`;
  }, []);

  const dismissPrompt = useCallback(() => {
    if (!userId) {
      setShouldShow(false);
      return;
    }
    markSeen(userId, owner);
    setShouldShow(false);
  }, [owner, userId]);

  useEffect(() => {
    if (!userId) {
      setShouldShow(false);
      return;
    }
    if (!installBaseUrl) {
      setShouldShow(false);
      return;
    }
    if (connections === undefined) return;

    if (hasConnectionForOwner) {
      markSeen(userId, owner);
      setShouldShow(false);
      return;
    }

    const seen = wasSeen(userId, owner);
    setShouldShow(!seen);
  }, [connections, hasConnectionForOwner, installBaseUrl, owner, userId]);

  useEffect(() => {
    if (!userId) return;
    const handleMessage = (event: MessageEvent) => {
      const data = event?.data;
      if (data && typeof data === "object" && "type" in data) {
        const type = (data as { type?: unknown }).type;
        if (type === "cmux/github-install-complete") {
          dismissPrompt();
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [dismissPrompt, userId]);

  const disableInstall = !installBaseUrl || isStartingInstall;

  const handleInstall = useCallback(async () => {
    if (!userId) return;
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
      markSeen(userId, owner);
      setShouldShow(false);
    } catch (error) {
      console.error("Failed to start GitHub installation", error);
    } finally {
      setIsStartingInstall(false);
    }
  }, [installBaseUrl, mintState, owner, teamSlugOrId, userId]);

  if (!shouldShow) {
    return null;
  }

  return (
    <div className="relative rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full border border-amber-200 bg-amber-100/70 p-1 text-amber-700">
            <AlertCircle className="h-4 w-4" />
          </div>
          <div className="space-y-1">
            <p className="font-medium text-neutral-900">
              Install the cmux GitHub app for {owner}
            </p>
            <p className="text-sm text-neutral-600">
              Install the cmux agent to grant access to{" "}
              <span className="font-medium text-neutral-800">
                {repoFullName}
              </span>{" "}
              and related repositories. After installing, refresh this page to
              continue the review.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            type="button"
            onClick={handleInstall}
            disabled={disableInstall}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:bg-neutral-400"
          >
            {isStartingInstall ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Install agent
          </button>
          <button
            type="button"
            onClick={dismissPrompt}
            className="inline-flex items-center justify-center rounded-md border border-neutral-200 px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-50"
          >
            Not now
          </button>
        </div>
        <button
          type="button"
          onClick={dismissPrompt}
          className="absolute right-4 top-4 inline-flex h-6 w-6 items-center justify-center rounded-full text-neutral-400 transition hover:bg-neutral-100 hover:text-neutral-600"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
