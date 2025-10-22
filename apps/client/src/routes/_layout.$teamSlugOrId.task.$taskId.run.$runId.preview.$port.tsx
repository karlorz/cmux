import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import z from "zod";
import { Terminal } from "lucide-react";
import { TaskRunTerminalSession } from "@/components/task-run-terminal-session";
import { toMorphXtermBaseUrl } from "@/lib/toProxyWorkspaceUrl";
import {
  createTerminalTab,
  terminalTabsQueryKey,
  terminalTabsQueryOptions,
  type TerminalTabId,
} from "@/queries/terminals";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
  port: z.string(),
});

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
  const queryClient = useQueryClient();

  const taskRuns = useQuery(api.taskRuns.getByTask, {
    teamSlugOrId,
    taskId,
  });

  // Get the specific run
  const selectedRun = useMemo(() => {
    return taskRuns?.find((run) => run._id === runId);
  }, [runId, taskRuns]);

  // Find the service URL for the requested port
  const previewUrl = useMemo(() => {
    if (!selectedRun?.networking) return null;
    const portNum = parseInt(port, 10);
    const service = selectedRun.networking.find(
      (s) => s.port === portNum && s.status === "running",
    );
    return service?.url;
  }, [selectedRun, port]);

  const persistKey = useMemo(() => {
    return getTaskRunPreviewPersistKey(runId, port);
  }, [runId, port]);

  // Terminal state management
  const [isTerminalVisible, setIsTerminalVisible] = useState(false);
  const [terminalId, setTerminalId] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);

  // Get xterm base URL
  const xtermBaseUrl = useMemo(() => {
    const vscodeInfo = selectedRun?.vscode;
    const rawMorphUrl = vscodeInfo?.url ?? vscodeInfo?.workspaceUrl ?? null;
    const isMorphProvider = vscodeInfo?.provider === "morph";

    if (!isMorphProvider || !rawMorphUrl) {
      return null;
    }

    return toMorphXtermBaseUrl(rawMorphUrl);
  }, [selectedRun]);

  // Check for dev script errors
  useEffect(() => {
    if (selectedRun?.environmentError?.devError) {
      setHasError(true);
      setIsTerminalVisible(true);
    }
  }, [selectedRun]);

  // Create terminal tab for dev script
  useEffect(() => {
    if (!xtermBaseUrl || terminalId) return;

    const initTerminal = async () => {
      try {
        const tabsQueryKey = terminalTabsQueryKey(xtermBaseUrl, runId);

        // Check if terminal already exists
        const tabs = await queryClient.fetchQuery(
          terminalTabsQueryOptions({
            baseUrl: xtermBaseUrl,
            contextKey: runId,
          })
        );

        if (tabs.length > 0) {
          setTerminalId(tabs[0]);
          return;
        }

        // Create new terminal tab attached to dev tmux window
        const created = await createTerminalTab({
          baseUrl: xtermBaseUrl,
          request: {
            cmd: "tmux",
            args: ["attach", "-t", "cmux:dev"],
          },
        });

        setTerminalId(created.id);

        queryClient.setQueryData<TerminalTabId[]>(tabsQueryKey, (current) => {
          if (!current || current.length === 0) {
            return [created.id];
          }
          if (current.includes(created.id)) {
            return current;
          }
          return [...current, created.id];
        });
      } catch (error) {
        console.error("Failed to create dev terminal", error);
      }
    };

    void initTerminal();
  }, [xtermBaseUrl, runId, terminalId, queryClient]);

  const toggleTerminal = useCallback(() => {
    setIsTerminalVisible((prev) => !prev);
  }, []);

  const paneBorderRadius = 6;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex-1 min-h-0 flex flex-row">
        {/* Preview area */}
        <div
          className={cn(
            "flex-1 min-w-0 transition-all duration-300",
            isTerminalVisible && terminalId && "mr-0"
          )}
        >
          {previewUrl ? (
            <div className="h-full flex flex-col">
              {/* Top bar with terminal toggle */}
              <div className="flex items-center justify-end border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-2 py-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "size-7 rounded-full p-0 text-neutral-600 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-100",
                        isTerminalVisible && "text-primary dark:text-primary",
                        hasError && !isTerminalVisible && "text-red-600 dark:text-red-500"
                      )}
                      onClick={toggleTerminal}
                      disabled={!terminalId}
                      aria-label={isTerminalVisible ? "Hide terminal" : "Show terminal"}
                    >
                      <Terminal className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {isTerminalVisible ? "Hide terminal" : "Show terminal"}
                    {hasError && !isTerminalVisible && " (errors detected)"}
                  </TooltipContent>
                </Tooltip>
              </div>
              <div className="flex-1 min-h-0">
                <ElectronPreviewBrowser
                  persistKey={persistKey}
                  src={previewUrl}
                  borderRadius={paneBorderRadius}
                />
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center">
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
                    <div className="flex justify-center gap-2">
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

        {/* Terminal panel */}
        {isTerminalVisible && terminalId && xtermBaseUrl && (
          <div className="w-[450px] border-l border-neutral-200 dark:border-neutral-800 bg-neutral-950 flex flex-col">
            <TaskRunTerminalSession
              baseUrl={xtermBaseUrl}
              terminalId={terminalId}
              isActive={true}
            />
          </div>
        )}
      </div>
    </div>
  );
}
