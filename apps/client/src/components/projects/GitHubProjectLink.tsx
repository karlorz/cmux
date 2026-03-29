/**
 * GitHubProjectLink Component
 *
 * Allows linking a cmux project to a GitHub Projects v2 board.
 * Three states:
 * - Unlinked: URL input + "Link" button
 * - Linked, unresolved: URL + "Pending resolution" badge + "Grant Scope" button
 * - Linked + resolved: External link, cached counts, "Refresh" button
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  postApiProjectsByProjectIdLinkGithub,
  postApiProjectsByProjectIdRefreshGithub,
} from "@cmux/www-openapi-client";
import { convexQuery } from "@convex-dev/react-query";
import {
  ExternalLink,
  Link2,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  ListTodo,
} from "lucide-react";
import { useUser } from "@stackframe/react";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api } from "@cmux/convex/api";
import type { Doc } from "@cmux/convex/dataModel";

interface GitHubProjectLinkProps {
  project: Doc<"projects">;
  teamSlugOrId: string;
  onLinked?: () => void;
}

export function GitHubProjectLink({
  project,
  teamSlugOrId,
  onLinked,
}: GitHubProjectLinkProps) {
  const user = useUser({ or: "return-null" });
  const [urlInput, setUrlInput] = useState("");

  const { data: connections } = useQuery(
    convexQuery(api.github.listProviderConnections, { teamSlugOrId }),
  );

  // Link mutation
  const linkMutation = useMutation({
    mutationFn: async (githubProjectUrl: string) => {
      const response = await postApiProjectsByProjectIdLinkGithub({
        path: { projectId: project._id },
        body: { githubProjectUrl },
        throwOnError: true,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.linked) {
        if (data.resolved) {
          toast.success("GitHub Project linked successfully");
        } else if (data.needsReauthorization) {
          toast.info("URL saved. Grant OAuth scope to fetch project data.");
        } else {
          toast.success("GitHub Project URL saved");
        }
        setUrlInput("");
        onLinked?.();
      }
    },
    onError: (error) => {
      console.error("[GitHubProjectLink] Link failed:", error);
      toast.error("Failed to link GitHub Project");
    },
  });

  // Refresh mutation
  const refreshMutation = useMutation({
    mutationFn: async () => {
      const response = await postApiProjectsByProjectIdRefreshGithub({
        path: { projectId: project._id },
        throwOnError: true,
      });
      return response.data;
    },
    onSuccess: (data) => {
      if (data?.refreshed) {
        toast.success("GitHub Project cache refreshed");
        onLinked?.();
      } else if (data?.needsReauthorization) {
        toast.info("Grant OAuth scope to refresh project data.");
      }
    },
    onError: (error) => {
      console.error("[GitHubProjectLink] Refresh failed:", error);
      toast.error("Failed to refresh GitHub Project cache");
    },
  });

  const handleLink = () => {
    const trimmedUrl = urlInput.trim();
    if (!trimmedUrl) return;
    linkMutation.mutate(trimmedUrl);
  };

  const handleGrantScope = () => {
    // Trigger OAuth redirect with 'project' scope
    void user?.getConnectedAccount("github", {
      or: "redirect",
      scopes: ["project"],
    });
  };

  const isLinked = Boolean(project.githubProjectUrl);
  const isResolved = Boolean(project.githubProjectId);
  const needsReauth =
    isLinked && !isResolved && project.githubProjectOwnerType === "user";
  const matchingConnection = useMemo(() => {
    const activeConnections =
      connections?.filter((connection) => connection.isActive) ?? [];
    const normalizedOwner = project.githubProjectOwner?.toLowerCase();

    if (!normalizedOwner) {
      return activeConnections[0];
    }

    return (
      activeConnections.find(
        (connection) =>
          connection.accountLogin?.toLowerCase() === normalizedOwner,
      ) ?? activeConnections[0]
    );
  }, [connections, project.githubProjectOwner]);
  const internalProjectItemsSearch = useMemo(() => {
    if (!project.githubProjectId || !matchingConnection) {
      return null;
    }

    const owner = project.githubProjectOwner ?? matchingConnection.accountLogin;
    const ownerType =
      project.githubProjectOwnerType ??
      (matchingConnection.accountType === "Organization"
        ? "organization"
        : "user");

    if (!owner) {
      return null;
    }

    return {
      installationId: matchingConnection.installationId,
      owner,
      ownerType,
      ...(project.githubProjectUrl ? { projectUrl: project.githubProjectUrl } : {}),
    } as const;
  }, [
    matchingConnection,
    project.githubProjectId,
    project.githubProjectOwner,
    project.githubProjectOwnerType,
    project.githubProjectUrl,
  ]);

  // Format cached time
  const formatCacheTime = (timestamp?: number) => {
    if (!timestamp) return null;
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center gap-2 mb-3">
        <Link2 className="h-4 w-4 text-neutral-500" />
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
          GitHub Project
        </h3>
      </div>

      {!isLinked ? (
        // Unlinked state: URL input
        <div className="space-y-3">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Link this project to a GitHub Projects v2 board to see unified
            progress.
          </p>
          <div className="flex gap-2">
            <input
              type="url"
              placeholder="https://github.com/users/owner/projects/1"
              value={urlInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUrlInput(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleLink();
                }
              }}
              className="flex-1 h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-neutral-700 dark:bg-neutral-800 dark:placeholder:text-neutral-500"
              disabled={linkMutation.isPending}
            />
            <Button
              size="sm"
              onClick={handleLink}
              disabled={!urlInput.trim() || linkMutation.isPending}
            >
              {linkMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Link"
              )}
            </Button>
          </div>
        </div>
      ) : needsReauth ? (
        // Linked but unresolved (user project, needs OAuth scope)
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 p-3 dark:bg-amber-950/30">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                Pending Resolution
              </p>
              <p className="text-xs text-amber-600 dark:text-amber-500 mt-1">
                Grant the &quot;project&quot; OAuth scope to fetch data from your
                GitHub Project.
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <a
              href={project.githubProjectUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1 truncate max-w-[70%]"
            >
              {project.githubProjectUrl}
              <ExternalLink className="h-3 w-3 flex-shrink-0" />
            </a>
            <Button size="sm" variant="outline" onClick={handleGrantScope}>
              Grant Scope
            </Button>
          </div>
        </div>
      ) : (
        // Linked and resolved
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500" />
            <a
              href={project.githubProjectUrl ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 flex items-center gap-1"
            >
              {project.githubProjectOwner}/projects/{project.githubProjectNumber}
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>

          {/* Cached item counts */}
          {project.githubItemsTotal != null && (
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-neutral-500 dark:text-neutral-400">
                  Items:
                </span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {project.githubItemsTotal}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-green-500" />
                <span className="text-neutral-700 dark:text-neutral-300">
                  {project.githubItemsDone ?? 0} done
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-blue-500" />
                <span className="text-neutral-700 dark:text-neutral-300">
                  {project.githubItemsInProgress ?? 0} in progress
                </span>
              </div>
            </div>
          )}

          {/* Refresh button and cache time */}
          <div className="flex items-center justify-between">
            {project.githubItemsCachedAt && (
              <span className="text-xs text-neutral-400 dark:text-neutral-500">
                Updated {formatCacheTime(project.githubItemsCachedAt)}
              </span>
            )}
            <div
              className={clsx(
                "flex items-center gap-2",
                !project.githubItemsCachedAt && "ml-auto",
              )}
            >
              {project.githubProjectId && internalProjectItemsSearch && (
                <Button asChild size="sm" variant="outline">
                  <Link
                    to="/$teamSlugOrId/projects/$projectId"
                    params={{
                      teamSlugOrId,
                      projectId: project.githubProjectId,
                    }}
                    search={internalProjectItemsSearch}
                  >
                    <ListTodo className="h-4 w-4 mr-1.5" />
                    View Items
                  </Link>
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refreshMutation.mutate()}
                disabled={refreshMutation.isPending}
              >
                <RefreshCw
                  className={clsx(
                    "h-4 w-4 mr-1.5",
                    refreshMutation.isPending && "animate-spin"
                  )}
                />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
