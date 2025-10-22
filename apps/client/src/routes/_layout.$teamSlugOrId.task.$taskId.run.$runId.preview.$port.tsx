import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import {
  TaskRunTerminalSession,
  type TerminalConnectionState,
} from "@/components/task-run-terminal-session";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { toMorphXtermBaseUrl } from "@/lib/toProxyWorkspaceUrl";
import { cn } from "@/lib/utils";
import {
  createTerminalTab,
  terminalTabsQueryKey,
  terminalTabsQueryOptions,
  type TerminalTabId,
} from "@/queries/terminals";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery as useReactQuery, useQueryClient } from "@tanstack/react-query";
import { useQuery as useConvexQuery } from "convex/react";
import { ExternalLink, Terminal as TerminalIcon } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import z from "zod";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  port: z.string(),
});

type PanelState = "default" | "open" | "closed";

const TERMINAL_STATE_COLORS: Record<TerminalConnectionState, string> = {
  open: "bg-emerald-500",
  connecting: "bg-amber-500",
  closed: "bg-neutral-400 dark:bg-neutral-600",
  error: "bg-red-500",
};

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/preview/$port",
)({
  component: PreviewPage,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => {
      return {
        taskId: params.taskId,
        runId: params.runId,
        port: params.port,
      };
    },
  },
});

function PreviewPage() {
  const { taskId, teamSlugOrId, runId, port } = Route.useParams();

  const taskRuns = useConvexQuery(api.taskRuns.getByTask, {
    teamSlugOrId,
    taskId,
  });

  const selectedRun = useMemo(() => {
    return taskRuns?.find((run) => run._id === runId);
  }, [runId, taskRuns]);

  const previewUrl = useMemo(() => {
    if (!selectedRun?.networking) return null;
    const portNum = parseInt(port, 10);
    const service = selectedRun.networking.find(
      (s) => s.port === portNum && s.status === "running",
    );
    return service?.url ?? null;
  }, [selectedRun, port]);

  const persistKey = useMemo(() => {
    return getTaskRunPreviewPersistKey(runId, port);
  }, [runId, port]);

  const terminalBaseUrl = useMemo(() => {
    const vscodeInfo = selectedRun?.vscode;
    if (vscodeInfo?.provider !== "morph") {
      return null;
    }
    const rawMorphUrl = vscodeInfo.url ?? vscodeInfo.workspaceUrl ?? null;
    if (!rawMorphUrl) {
      return null;
    }
    return toMorphXtermBaseUrl(rawMorphUrl);
  }, [selectedRun]);

  const hasTerminalBackend = Boolean(terminalBaseUrl);

  const queryClient = useQueryClient();
  const terminalTabsQuery = useReactQuery(
    terminalTabsQueryOptions({
      baseUrl: terminalBaseUrl,
      contextKey: runId,
      enabled: hasTerminalBackend,
    }),
  );

  const terminalIds = useMemo(
    () => terminalTabsQuery.data ?? [],
    [terminalTabsQuery.data],
  );
  const activeTerminalId = terminalIds[0] ?? null;

  const [panelState, setPanelState] = useState<PanelState>("default");
  const [terminalConnectionState, setTerminalConnectionState] =
    useState<TerminalConnectionState>("connecting");

  const hasPreviewError = Boolean(selectedRun && !previewUrl);
  const shouldAutoShowTerminal = panelState === "default" && hasPreviewError;
  const isTerminalVisible = panelState === "open" || shouldAutoShowTerminal;

  const bootstrapAttemptedRef = useRef(false);

  const ensureDefaultTerminal = useCallback(async () => {
    if (!hasTerminalBackend || !terminalBaseUrl) {
      return;
    }
    try {
      const created = await createTerminalTab({
        baseUrl: terminalBaseUrl,
        request: {
          cmd: "tmux",
          args: ["attach", "-t", "cmux"],
        },
      });

      queryClient.setQueryData<TerminalTabId[]>(
        terminalTabsQueryKey(terminalBaseUrl, runId),
        (current) => {
          if (!current || current.length === 0) {
            return [created.id];
          }
          if (current.includes(created.id)) {
            return current;
          }
          return [...current, created.id];
        },
      );
    } catch (error) {
      console.error("Failed to auto-create tmux terminal", error);
      throw error;
    }
  }, [hasTerminalBackend, queryClient, runId, terminalBaseUrl]);

  const triggerEnsureDefaultTerminal = useCallback(() => {
    if (bootstrapAttemptedRef.current) {
      return;
    }
    bootstrapAttemptedRef.current = true;
    void ensureDefaultTerminal().catch(() => {
      bootstrapAttemptedRef.current = false;
    });
  }, [ensureDefaultTerminal]);

  if (
    isTerminalVisible &&
    hasTerminalBackend &&
    terminalTabsQuery.isFetched &&
    terminalIds.length === 0 &&
    !bootstrapAttemptedRef.current
  ) {
    triggerEnsureDefaultTerminal();
  } else if (!isTerminalVisible && panelState === "default") {
    bootstrapAttemptedRef.current = false;
  }

  const handleToggleTerminal = useCallback(() => {
    setPanelState((current) => {
      const currentlyVisible =
        current === "open" || (current === "default" && hasPreviewError);
      const nextState: PanelState = currentlyVisible ? "closed" : "open";

      if (!currentlyVisible && nextState === "open") {
        bootstrapAttemptedRef.current = false;
        if (hasTerminalBackend && terminalIds.length === 0) {
          triggerEnsureDefaultTerminal();
        }
      }

      if (currentlyVisible && nextState === "closed") {
        bootstrapAttemptedRef.current = false;
      }

      return nextState;
    });
  }, [hasPreviewError, hasTerminalBackend, terminalIds.length, triggerEnsureDefaultTerminal]);

  const handleConnectionStateChange = useCallback(
    (next: TerminalConnectionState) => {
      setTerminalConnectionState(next);
    },
    [],
  );

  const terminalIndicatorClass = TERMINAL_STATE_COLORS[
    hasTerminalBackend ? terminalConnectionState : "closed"
  ];

  const paneBorderRadius = 6;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Preview (port {port})
          </span>
          {hasPreviewError ? (
            <span className="text-xs font-medium text-red-500 dark:text-red-400">
              Unavailable
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={!previewUrl}
                onClick={() => {
                  if (!previewUrl) {
                    return;
                  }
                  if (typeof window !== "undefined") {
                    window.open(previewUrl, "_blank", "noopener,noreferrer");
                  }
                }}
              >
                <ExternalLink className="size-4" />
                <span>Open in browser</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Open preview in browser
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={isTerminalVisible ? "default" : "outline"}
                size="icon"
                onClick={handleToggleTerminal}
                aria-pressed={isTerminalVisible}
                disabled={!hasTerminalBackend}
              >
                <div className="relative flex items-center justify-center">
                  <TerminalIcon className="size-4" />
                  <span
                    className={cn(
                      "absolute -bottom-1 -right-1 h-2 w-2 rounded-full border-2 border-white dark:border-neutral-950",
                      terminalIndicatorClass,
                    )}
                  />
                </div>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              Toggle dev terminal
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0">
          {previewUrl ? (
            <ElectronPreviewBrowser
              persistKey={persistKey}
              src={previewUrl}
              borderRadius={paneBorderRadius}
            />
          ) : (
            <div className="flex h-full items-center justify-center px-6">
              <div className="text-center">
                <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedRun
                    ? `Port ${port} is not available for this run`
                    : "Loading..."}
                </p>
                {selectedRun?.networking && selectedRun.networking.length > 0 && (
                  <div className="mt-4">
                    <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
                      Available ports:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {selectedRun.networking
                        .filter((s) => s.status === "running")
                        .map((service) => (
                          <span
                            key={service.port}
                            className="rounded px-2 py-1 text-xs bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                          >
                            {service.port}
                          </span>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
        {isTerminalVisible ? (
          <div className="flex h-full w-[380px] flex-shrink-0 flex-col border-l border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
            <div className="border-b border-neutral-200 px-3 py-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
              Dev terminal
            </div>
            <div className="flex-1 min-h-0">
              {hasTerminalBackend ? (
                activeTerminalId && terminalBaseUrl ? (
                  <TaskRunTerminalSession
                    baseUrl={terminalBaseUrl}
                    terminalId={activeTerminalId}
                    isActive
                    onConnectionStateChange={handleConnectionStateChange}
                  />
                ) : terminalTabsQuery.isLoading || terminalTabsQuery.isFetching ? (
                  <div className="flex h-full items-center justify-center px-4 text-sm text-neutral-500 dark:text-neutral-400">
                    Starting terminal…
                  </div>
                ) : (
                  <div className="flex h-full items-center justify-center px-4 text-sm text-neutral-500 dark:text-neutral-400">
                    Unable to start terminal for this run.
                  </div>
                )
              ) : (
                <div className="flex h-full items-center justify-center px-4 text-sm text-neutral-500 dark:text-neutral-400 text-center">
                  Terminals are only available for Morph-backed environments.
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
