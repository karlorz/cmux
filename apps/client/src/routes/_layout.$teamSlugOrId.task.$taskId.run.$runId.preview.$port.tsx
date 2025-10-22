import { TaskRunPreviewTerminal } from "@/components/task-run-preview-terminal";
import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import clsx from "clsx";
import { Terminal } from "lucide-react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import type { TerminalConnectionState } from "@/components/task-run-terminal-session";
import z from "zod";

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

  const paneBorderRadius = 6;

  const vscodeInfo = selectedRun?.vscode ?? null;
  const provider = vscodeInfo?.provider;
  const primaryVscodeUrl = vscodeInfo?.url ?? null;
  const workspaceUrl = vscodeInfo?.workspaceUrl ?? null;

  const [isTerminalVisible, setIsTerminalVisible] = useState(false);
  const [terminalState, setTerminalState] =
    useState<TerminalConnectionState>("connecting");

  const canUseTerminal = useMemo(() => {
    return provider === "morph" && Boolean(primaryVscodeUrl || workspaceUrl);
  }, [primaryVscodeUrl, provider, workspaceUrl]);

  useEffect(() => {
    if (terminalState === "error") {
      setIsTerminalVisible(true);
    }
  }, [terminalState]);

  useEffect(() => {
    if (!canUseTerminal) {
      setIsTerminalVisible(false);
    }
  }, [canUseTerminal]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 bg-neutral-100/70 px-3 py-2 dark:border-neutral-800 dark:bg-neutral-900/40">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
            Preview
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Port {port}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {previewUrl ? (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs font-medium text-neutral-700 dark:text-neutral-200"
            >
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                Open in Browser
              </a>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              disabled
              className="h-8 px-3 text-xs font-medium text-neutral-500"
            >
              Open in Browser
            </Button>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsTerminalVisible((current) => !current)}
                disabled={!canUseTerminal}
                aria-pressed={isTerminalVisible}
                aria-label={
                  isTerminalVisible ? "Hide dev terminal" : "Show dev terminal"
                }
                className={clsx(
                  "size-8 text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100",
                  isTerminalVisible &&
                    "bg-neutral-200 hover:bg-neutral-300 dark:bg-neutral-800 dark:hover:bg-neutral-700",
                  terminalState === "error" && !isTerminalVisible &&
                    "text-red-600 dark:text-red-400"
                )}
              >
                <Terminal className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="end">
              {isTerminalVisible ? "Hide dev terminal" : "Show dev terminal"}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 flex-1">
          <div className="flex-1 min-h-0">
            {previewUrl ? (
              <ElectronPreviewBrowser
                persistKey={persistKey}
                src={previewUrl}
                borderRadius={paneBorderRadius}
              />
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
                              className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
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
        </div>
        <div
          className={clsx(
            "relative flex min-h-0 flex-col overflow-hidden transition-[width,opacity] duration-300 ease-in-out",
            isTerminalVisible ? "w-full max-w-[26rem]" : "w-0"
          )}
          aria-hidden={!isTerminalVisible}
        >
          <div
            className={clsx(
              "flex-1 min-h-0",
              !isTerminalVisible && "pointer-events-none opacity-0"
            )}
          >
            <TaskRunPreviewTerminal
              runId={runId}
              provider={provider}
              primaryUrl={primaryVscodeUrl}
              workspaceUrl={workspaceUrl}
              isVisible={isTerminalVisible}
              onConnectionStateChange={setTerminalState}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
