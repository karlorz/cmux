/**
 * RecommendedActions Component
 *
 * Displays recommended actions from both project state and Obsidian vault.
 * Project-state recommendations work without vault configuration.
 */

import { useQuery, useMutation } from "@tanstack/react-query";
import {
  CheckSquare,
  FolderOpen,
  AlertCircle,
  FileText,
  Link2Off,
  Clock,
  Loader2,
  Play,
  Settings,
  XCircle,
  PlayCircle,
  FileQuestion,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import clsx from "clsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { getApiVaultRecommendationsOptions } from "@cmux/www-openapi-client/react-query";
import { postApiVaultDispatch } from "@cmux/www-openapi-client";
import { toast } from "sonner";

// Extended type to include both vault and project-sourced recommendations
type RecommendedActionType =
  | "todo"
  | "stale_note"
  | "missing_docs"
  | "broken_link"
  | "stale_project"
  | "failed_tasks"
  | "unstarted_plan"
  | "no_plan";

interface RecommendedAction {
  type: RecommendedActionType;
  source: string;
  description: string;
  priority: "high" | "medium" | "low";
  suggestedPrompt?: string;
  projectId?: string; // Present for project-sourced recommendations
}

interface RecommendedActionsProps {
  teamSlugOrId: string;
  className?: string;
  limit?: number;
  showDispatch?: boolean;
  onActionDispatch?: (action: RecommendedAction, taskId: string) => void;
}

const ACTION_TYPE_CONFIG: Record<
  RecommendedActionType,
  { icon: typeof CheckSquare; label: string; color: string; bgColor: string }
> = {
  // Vault-sourced types
  todo: {
    icon: CheckSquare,
    label: "TODO",
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  stale_note: {
    icon: Clock,
    label: "Stale Note",
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  missing_docs: {
    icon: FileText,
    label: "Missing Docs",
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
  broken_link: {
    icon: Link2Off,
    label: "Broken Link",
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
  },
  // Project-sourced types
  stale_project: {
    icon: Clock,
    label: "Stale Project",
    color: "text-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
  },
  failed_tasks: {
    icon: XCircle,
    label: "Failed Tasks",
    color: "text-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
  },
  unstarted_plan: {
    icon: PlayCircle,
    label: "Ready to Dispatch",
    color: "text-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
  },
  no_plan: {
    icon: FileQuestion,
    label: "No Plan",
    color: "text-purple-500",
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
  },
};

const PRIORITY_CONFIG = {
  high: {
    color: "text-red-600 dark:text-red-400",
    bgColor: "bg-red-100 dark:bg-red-900/30",
    label: "High",
  },
  medium: {
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
    label: "Medium",
  },
  low: {
    color: "text-neutral-600 dark:text-neutral-400",
    bgColor: "bg-neutral-100 dark:bg-neutral-800",
    label: "Low",
  },
};

function ActionItem({
  action,
  teamSlugOrId,
  showDispatch,
  onDispatch,
  isDispatching,
}: {
  action: RecommendedAction;
  teamSlugOrId: string;
  showDispatch: boolean;
  onDispatch: (action: RecommendedAction) => void;
  isDispatching: boolean;
}) {
  const typeConfig = ACTION_TYPE_CONFIG[action.type];
  const priorityConfig = PRIORITY_CONFIG[action.priority];
  const Icon = typeConfig.icon;

  return (
    <div className="flex items-start gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div
        className={clsx(
          "flex size-8 shrink-0 items-center justify-center rounded-md",
          typeConfig.bgColor
        )}
      >
        <Icon className={clsx("size-4", typeConfig.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "rounded px-1.5 py-0.5 text-xs font-medium",
              priorityConfig.bgColor,
              priorityConfig.color
            )}
          >
            {priorityConfig.label}
          </span>
          {action.projectId ? (
            <Link
              to="/$teamSlugOrId/projects/detail/$projectId"
              params={{ teamSlugOrId, projectId: action.projectId }}
              className="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 truncate"
            >
              {action.source}
            </Link>
          ) : (
            <span className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
              {action.source}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-900 dark:text-neutral-100 line-clamp-2">
          {action.description}
        </p>
        {showDispatch && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs"
            onClick={() => onDispatch(action)}
            disabled={isDispatching}
          >
            {isDispatching ? (
              <Loader2 className="mr-1.5 size-3 animate-spin" />
            ) : (
              <Play className="mr-1.5 size-3" />
            )}
            Dispatch to Agent
          </Button>
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="size-8 shrink-0 rounded-md" />
          <div className="flex-1 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-24" />
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function RecommendedActions({
  teamSlugOrId,
  className,
  limit = 10,
  showDispatch = true,
  onActionDispatch,
}: RecommendedActionsProps) {
  // Fetch recommendations from vault API
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    ...getApiVaultRecommendationsOptions({
      query: { teamSlugOrId, limit },
    }),
    staleTime: 60_000, // Cache for 1 minute
  });

  // Dispatch mutation
  const dispatchMutation = useMutation({
    mutationFn: async (action: RecommendedAction) => {
      const response = await postApiVaultDispatch({
        body: {
          teamSlugOrId,
          recommendation: action,
        },
        throwOnError: true,
      });
      return response.data;
    },
    onSuccess: (result, action) => {
      if (result?.taskId) {
        toast.success("Task created from recommendation");
        onActionDispatch?.(action, result.taskId);
        refetch();
      }
    },
    onError: (error) => {
      console.error("[RecommendedActions] Dispatch failed:", error);
      toast.error("Failed to create task");
    },
  });

  const handleDispatch = (action: RecommendedAction) => {
    dispatchMutation.mutate(action);
  };

  // Loading state
  if (isLoading) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            Recommended Actions
          </h3>
        </div>
        <LoadingSkeleton />
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            Recommended Actions
          </h3>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <AlertCircle className="size-8 text-red-400" />
          <p className="text-sm text-neutral-500">Failed to load recommendations</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // Empty state (no recommendations from either source)
  if (!data?.recommendations || data.recommendations.length === 0) {
    return (
      <div
        className={clsx(
          "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
          className
        )}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
          <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
            Recommended Actions
          </h3>
        </div>
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <CheckSquare className="size-8 text-green-400" />
          <div>
            <p className="font-medium text-neutral-900 dark:text-neutral-100">
              All Caught Up
            </p>
            <p className="mt-1 text-sm text-neutral-500">
              No pending actions found.
            </p>
          </div>
          {/* Vault config suggestion if not configured */}
          {!data?.vaultConfigured && (
            <Link
              to="/$teamSlugOrId/settings"
              params={{ teamSlugOrId }}
              search={{ section: "general" }}
              className="mt-2"
            >
              <Button variant="ghost" size="sm" className="text-xs">
                <Settings className="mr-1.5 size-3" />
                Configure Obsidian vault for more recommendations
              </Button>
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Recommendations list
  return (
    <div
      className={clsx(
        "rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <h3 className="font-medium text-neutral-900 dark:text-neutral-100">
          Recommended Actions
        </h3>
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {data.recommendations.length} items
        </span>
      </div>
      <div className="space-y-3 p-4">
        {data.recommendations.map((action, index) => (
          <ActionItem
            key={`${action.source}-${action.type}-${index}`}
            action={action as RecommendedAction}
            teamSlugOrId={teamSlugOrId}
            showDispatch={showDispatch}
            onDispatch={handleDispatch}
            isDispatching={dispatchMutation.isPending}
          />
        ))}
      </div>
      {/* Vault config note if not configured but we have project recommendations */}
      {!data?.vaultConfigured && (
        <div className="border-t border-neutral-200 px-4 py-2 dark:border-neutral-800">
          <Link
            to="/$teamSlugOrId/settings"
            params={{ teamSlugOrId }}
            search={{ section: "general" }}
          >
            <Button variant="ghost" size="sm" className="w-full text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300">
              <FolderOpen className="mr-1.5 size-3" />
              Configure Obsidian vault for more recommendations
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}
