import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { DevTerminalPanel } from "@/components/preview/DevTerminalPanel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ExternalLink, Terminal } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

  const [isTerminalOpen, setIsTerminalOpen] = useState(false);
  const devError = selectedRun?.environmentError?.devError ?? null;
  const maintenanceError = selectedRun?.environmentError?.maintenanceError ?? null;
  const previousDevErrorRef = useRef<string | null>(null);

  useEffect(() => {
    if (devError && previousDevErrorRef.current !== devError) {
      setIsTerminalOpen(true);
    }
    previousDevErrorRef.current = devError ?? null;
  }, [devError]);

  const handleOpenInBrowser = useCallback(() => {
    if (!previewUrl) {
      return;
    }
    window.open(previewUrl, "_blank", "noopener,noreferrer");
  }, [previewUrl]);

  const hasEnvironmentIssues = Boolean(devError || maintenanceError);

  const previewHost = useMemo(() => {
    if (!previewUrl) {
      return null;
    }
    try {
      const parsed = new URL(previewUrl);
      return parsed.host;
    } catch {
      return null;
    }
  }, [previewUrl]);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="flex flex-col border-b border-neutral-200 dark:border-neutral-800">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2">
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
              Preview (port {port})
            </span>
            <span className="text-xs text-neutral-500 dark:text-neutral-400">
              {previewHost ?? "Live dev server"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {previewUrl ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="flex items-center gap-1"
                onClick={handleOpenInBrowser}
              >
                <ExternalLink className="size-3.5" />
                Open in Browser
              </Button>
            ) : null}
            <Button
              type="button"
              variant={isTerminalOpen ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "relative flex items-center gap-1 text-neutral-600 hover:text-neutral-800 dark:text-neutral-300 dark:hover:text-neutral-100",
                isTerminalOpen ? "bg-neutral-200/70 dark:bg-neutral-800/70" : undefined,
              )}
              onClick={() => setIsTerminalOpen((prev) => !prev)}
            >
              <Terminal className="size-3.5" />
              {isTerminalOpen ? "Hide Terminal" : "Show Terminal"}
              {devError ? (
                <span
                  className="absolute -right-1 -top-1 inline-flex size-2 rounded-full bg-red-500"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </div>
        </div>
        {hasEnvironmentIssues ? (
          <div className="border-t border-neutral-200 bg-neutral-100 px-4 py-2 text-xs text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
            {devError ? (
              <p className="line-clamp-2">
                <span className="font-semibold text-red-600 dark:text-red-400">Dev script:</span>{" "}
                {devError}
              </p>
            ) : null}
            {maintenanceError ? (
              <p className={cn("line-clamp-2", devError ? "mt-1" : undefined)}>
                <span className="font-semibold text-amber-600 dark:text-amber-400">Maintenance:</span>{" "}
                {maintenanceError}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <div
          className={cn(
            "flex-1 min-h-[280px] min-w-0 bg-white transition-[flex-basis] duration-300 ease-out dark:bg-neutral-950",
            isTerminalOpen ? "basis-full md:basis-[60%]" : "basis-full",
          )}
        >
          <div className="flex h-full min-h-0 flex-col">
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
        </div>
        {isTerminalOpen ? <DevTerminalPanel className="md:max-w-[480px]" /> : null}
      </div>
    </div>
  );
}
