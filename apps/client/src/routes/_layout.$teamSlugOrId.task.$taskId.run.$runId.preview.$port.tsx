import { DevScriptTerminalPane } from "@/components/dev-terminal/DevScriptTerminalPane";
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
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ExternalLink, TerminalSquare } from "lucide-react";
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

const DEV_TERMINAL_PORT = 39383;

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

  const devScriptError = selectedRun?.environmentError?.devError ?? null;

  const xtermServiceUrl = useMemo(() => {
    if (!selectedRun?.networking) {
      return null;
    }
    const service = selectedRun.networking.find((entry) => {
      return entry.status === "running" && entry.port === DEV_TERMINAL_PORT;
    });
    return service?.url ?? null;
  }, [selectedRun]);

  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const hasAutoOpenedRef = useRef(false);

  useEffect(() => {
    if (devScriptError && !hasAutoOpenedRef.current) {
      hasAutoOpenedRef.current = true;
      setIsTerminalOpen(true);
    }
  }, [devScriptError]);

  const persistKey = useMemo(() => {
    return getTaskRunPreviewPersistKey(runId, port);
  }, [runId, port]);

  const terminalAvailable = Boolean(xtermServiceUrl);

  const paneBorderRadius = 6;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="border-b border-neutral-200 bg-white/80 px-4 py-3 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/80">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-neutral-800 dark:text-neutral-100">
              Preview · port {port}
            </span>
            {devScriptError ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 dark:border-red-900/60 dark:bg-red-900/25 dark:text-red-200">
                    <AlertCircle className="h-3 w-3" /> Dev script error
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-sm text-xs">
                  {devScriptError}
                </TooltipContent>
              </Tooltip>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {previewUrl ? (
              <Button asChild size="sm" variant="outline">
                <a
                  href={previewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open in browser
                </a>
              </Button>
            ) : null}
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    size="sm"
                    variant={isTerminalOpen ? "default" : "outline"}
                    className="inline-flex items-center gap-2"
                    onClick={() => setIsTerminalOpen((open) => !open)}
                    disabled={!terminalAvailable && !isTerminalOpen}
                  >
                    <TerminalSquare className="h-3.5 w-3.5" />
                    {isTerminalOpen ? "Hide terminal" : "Show terminal"}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                {terminalAvailable
                  ? isTerminalOpen
                    ? "Hide the dev script terminal"
                    : "Show the dev script terminal alongside the preview"
                  : "Dev terminal service is not currently available"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
      </div>
      <div className="flex min-h-0 flex-1">
        <div className="min-h-0 flex-1">
          <div className="flex h-full flex-col">
            <div className="min-h-0 flex-1">
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
        </div>
        {isTerminalOpen ? (
          xtermServiceUrl ? (
            <DevScriptTerminalPane
              key={xtermServiceUrl}
              serviceUrl={xtermServiceUrl}
              className="w-full max-w-md"
            />
          ) : (
            <div className="flex h-full w-full max-w-md flex-col items-center justify-center border-l border-neutral-200 bg-neutral-50 px-6 text-center text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
              Dev terminal service is not available for this run.
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
