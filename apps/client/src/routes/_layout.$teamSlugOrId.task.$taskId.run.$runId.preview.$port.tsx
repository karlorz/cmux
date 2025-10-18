import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { DevTerminalPanel } from "@/components/preview/DevTerminalPanel";
import { Button } from "@/components/ui/button";
import { getDevTerminalUrl } from "@/lib/getDevTerminalUrl";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { cn } from "@/lib/utils";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, TerminalSquare } from "lucide-react";
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

  const devErrorMessage = selectedRun?.environmentError?.devError ?? null;
  const hasDevError = Boolean(devErrorMessage);
  const [isTerminalVisible, setIsTerminalVisible] = useState<boolean>(hasDevError);
  useEffect(() => {
    if (hasDevError) {
      setIsTerminalVisible(true);
    }
  }, [hasDevError]);

  const [previewHasError, setPreviewHasError] = useState(false);
  const handlePreviewErrorState = useCallback((isError: boolean) => {
    setPreviewHasError(isError);
    if (isError) {
      setIsTerminalVisible(true);
    }
  }, []);

  const terminalBaseUrl = useMemo(() => {
    if (!selectedRun?.vscode) return null;
    return getDevTerminalUrl(
      selectedRun.vscode.url ?? selectedRun.vscode.workspaceUrl ?? null,
    );
  }, [selectedRun?.vscode?.url, selectedRun?.vscode?.workspaceUrl]);

  const availablePorts = useMemo(() => {
    return selectedRun?.networking
      ?.filter((service) => service.status === "running")
      ?.map((service) => service.port);
  }, [selectedRun?.networking]);

  const showPreviewFallback = !previewUrl;

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex items-start justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="space-y-1">
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            <TerminalSquare className="h-3.5 w-3.5" />
            Preview · Port {port}
          </span>
          {devErrorMessage ? (
            <p className="text-xs font-medium text-rose-500 dark:text-rose-400">
              Dev script reported an error. Inspect the terminal for details.
            </p>
          ) : previewHasError ? (
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              Preview failed to load. Terminal output may include the stack trace.
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {previewUrl ? (
            <Button
              asChild
              size="sm"
              variant="outline"
              className="bg-white/80 text-neutral-700 hover:bg-neutral-100 dark:bg-neutral-900/70 dark:text-neutral-100 dark:hover:bg-neutral-800"
            >
              <a href={previewUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
                Open in Browser
              </a>
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setIsTerminalVisible((visible) => !visible)}
            className={cn(
              "transition-colors",
              isTerminalVisible
                ? "border border-neutral-900/80 bg-neutral-900 text-neutral-100 hover:bg-neutral-800 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-50"
                : "border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:bg-transparent dark:text-neutral-200",
              (hasDevError || previewHasError) &&
                !isTerminalVisible &&
                "border border-rose-300 text-rose-600 dark:border-rose-500/70 dark:text-rose-400",
            )}
          >
            <TerminalSquare className="h-3.5 w-3.5" />
            {isTerminalVisible ? "Hide Terminal" : "Show Terminal"}
          </Button>
        </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex-1 min-h-[280px] min-w-0">
          {showPreviewFallback ? (
            <div className="flex h-full items-center justify-center px-6">
              <div className="text-center">
                <p className="mb-2 text-sm text-neutral-500 dark:text-neutral-400">
                  {selectedRun
                    ? `Port ${port} is not available for this run`
                    : "Loading..."}
                </p>
                {availablePorts && availablePorts.length > 0 ? (
                  <div className="mt-4">
                    <p className="mb-2 text-xs text-neutral-400 dark:text-neutral-500">
                      Available ports:
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {availablePorts.map((value) => (
                        <span
                          key={value}
                          className="rounded bg-neutral-100 px-2 py-1 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-200"
                        >
                          {value}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <ElectronPreviewBrowser
              persistKey={persistKey}
              src={previewUrl}
              onErrorStateChange={handlePreviewErrorState}
            />
          )}
        </div>
        {isTerminalVisible ? (
          <div className="shrink-0 border-t border-neutral-200 bg-neutral-950 dark:border-neutral-800 md:border-l md:border-t-0 md:w-[400px] lg:w-[440px]">
            <DevTerminalPanel baseUrl={terminalBaseUrl} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
