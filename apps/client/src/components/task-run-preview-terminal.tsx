import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  TaskRunTerminalSession,
  type TerminalConnectionState,
} from "@/components/task-run-terminal-session";
import { toMorphXtermBaseUrl } from "@/lib/toProxyWorkspaceUrl";
import {
  createTerminalTab,
  terminalTabsQueryKey,
  terminalTabsQueryOptions,
  type TerminalTabId,
} from "@/queries/terminals";

interface TaskRunPreviewTerminalProps {
  runId: string;
  provider: "docker" | "morph" | "daytona" | "other" | undefined;
  primaryUrl: string | null;
  workspaceUrl: string | null;
  isVisible: boolean;
  onConnectionStateChange?: (state: TerminalConnectionState) => void;
}

function getRawMorphUrl(primaryUrl: string | null, workspaceUrl: string | null) {
  if (primaryUrl && primaryUrl.trim().length > 0) {
    return primaryUrl;
  }
  if (workspaceUrl && workspaceUrl.trim().length > 0) {
    return workspaceUrl;
  }
  return null;
}

export function TaskRunPreviewTerminal({
  runId,
  provider,
  primaryUrl,
  workspaceUrl,
  isVisible,
  onConnectionStateChange,
}: TaskRunPreviewTerminalProps) {
  const rawMorphUrl = useMemo(() => {
    return getRawMorphUrl(primaryUrl, workspaceUrl);
  }, [primaryUrl, workspaceUrl]);

  const xtermBaseUrl = useMemo(() => {
    if (!rawMorphUrl) {
      return null;
    }
    return toMorphXtermBaseUrl(rawMorphUrl);
  }, [rawMorphUrl]);

  const hasTerminalBackend = provider === "morph" && Boolean(xtermBaseUrl);

  const queryClient = useQueryClient();
  const tabsQuery = useQuery(
    terminalTabsQueryOptions({
      baseUrl: xtermBaseUrl,
      contextKey: runId,
      enabled: hasTerminalBackend,
    })
  );

  const terminalIds = useMemo(() => tabsQuery.data ?? [], [tabsQuery.data]);
  const activeTerminalId = terminalIds[0] ?? null;

  const [connectionState, setConnectionState] =
    useState<TerminalConnectionState>("connecting");

  useEffect(() => {
    setConnectionState("connecting");
  }, [activeTerminalId]);

  useEffect(() => {
    if (!hasTerminalBackend) {
      setConnectionState("connecting");
    }
  }, [hasTerminalBackend]);

  const hasRequestedDefaultRef = useRef(false);

  const createTerminalMutation = useMutation({
    mutationKey: ["terminal-tabs", runId, xtermBaseUrl, "create-default"],
    mutationFn: async () => {
      const created = await createTerminalTab({
        baseUrl: xtermBaseUrl,
        request: {
          cmd: "tmux",
          args: ["attach", "-t", "cmux"],
        },
      });
      return created;
    },
    onSuccess: (payload) => {
      const queryKey = terminalTabsQueryKey(xtermBaseUrl, runId);
      queryClient.setQueryData<TerminalTabId[] | undefined>(queryKey, (current) => {
        if (!current) {
          return [payload.id];
        }
        if (current.includes(payload.id)) {
          return current;
        }
        return [...current, payload.id];
      });
      hasRequestedDefaultRef.current = false;
    },
    onError: () => {
      hasRequestedDefaultRef.current = false;
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: terminalTabsQueryKey(xtermBaseUrl, runId),
      });
    },
  });

  useEffect(() => {
    if (!hasTerminalBackend) {
      hasRequestedDefaultRef.current = false;
      return;
    }
    if (terminalIds.length > 0) {
      hasRequestedDefaultRef.current = false;
      return;
    }
    if (createTerminalMutation.isPending) {
      return;
    }
    if (hasRequestedDefaultRef.current) {
      return;
    }
    hasRequestedDefaultRef.current = true;
    createTerminalMutation.mutate();
  }, [createTerminalMutation, hasTerminalBackend, terminalIds.length]);

  const handleConnectionStateChange = useCallback(
    (state: TerminalConnectionState) => {
      setConnectionState((prev) => {
        if (prev === state) {
          return prev;
        }
        return state;
      });
      onConnectionStateChange?.(state);
    },
    [onConnectionStateChange]
  );

  const renderContent = () => {
    if (!hasTerminalBackend) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Terminals are only available for Morph-based runs.
        </div>
      );
    }

    if (tabsQuery.isError) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          <AlertTriangle className="size-5 text-red-500" aria-hidden="true" />
          <span>Failed to load dev terminal sessions.</span>
        </div>
      );
    }

    if (!activeTerminalId) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          {createTerminalMutation.isPending ? (
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
          ) : (
            <AlertTriangle className="size-5 text-neutral-400" aria-hidden="true" />
          )}
          <span>
            {createTerminalMutation.isPending
              ? "Starting dev terminal session..."
              : "Waiting for dev terminal session."}
          </span>
        </div>
      );
    }

    if (!xtermBaseUrl) {
      return (
        <div className="flex h-full items-center justify-center px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
          Preparing terminal backend...
        </div>
      );
    }

    return (
      <TaskRunTerminalSession
        key={activeTerminalId}
        baseUrl={xtermBaseUrl}
        terminalId={activeTerminalId}
        isActive={isVisible}
        onConnectionStateChange={handleConnectionStateChange}
      />
    );
  };

  return (
    <div className="flex h-full flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
        <span>Dev Terminal</span>
        <span
          className={clsx("rounded-full px-2 py-0.5 text-[11px]", {
            "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300":
              connectionState === "open",
            "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300":
              connectionState === "connecting",
            "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-300":
              connectionState === "error",
            "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300":
              connectionState === "closed",
          })}
        >
          {connectionState === "open"
            ? "Connected"
            : connectionState === "connecting"
              ? "Connecting"
              : connectionState === "error"
                ? "Error"
                : "Closed"}
        </span>
      </div>
      <div className="flex-1 bg-neutral-950">
        {renderContent()}
      </div>
    </div>
  );
}
