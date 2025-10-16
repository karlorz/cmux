import { DevTerminalView } from "@/components/dev-terminal-view";
import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import { Button } from "@/components/ui/button";
import { getTaskRunPreviewPersistKey } from "@/lib/persistent-webview-keys";
import { toDevTerminalUrl } from "@/lib/toProxyWorkspaceUrl";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { ExternalLink, Terminal as TerminalIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

  const devTerminalUrl = useMemo(() => {
    const candidates = [
      previewUrl,
      selectedRun?.vscode?.workspaceUrl ?? null,
      selectedRun?.vscode?.url ?? null,
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      const resolved = toDevTerminalUrl(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }, [previewUrl, selectedRun?.vscode?.url, selectedRun?.vscode?.workspaceUrl]);

  const devError = useMemo(() => {
    const raw = selectedRun?.environmentError?.devError;
    if (!raw) return null;
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [selectedRun?.environmentError?.devError]);

  const [isTerminalOpen, setIsTerminalOpen] = useState(() => Boolean(devError));

  useEffect(() => {
    if (devError) {
      setIsTerminalOpen(true);
    }
  }, [devError]);

  const persistKey = useMemo(() => {
    return getTaskRunPreviewPersistKey(runId, port);
  }, [runId, port]);

  const paneBorderRadius = 6;

  const previewContent = previewUrl ? (
    <ElectronPreviewBrowser
      persistKey={persistKey}
      src={previewUrl}
      borderRadius={paneBorderRadius}
    />
  ) : (
    <div className="flex h-full items-center justify-center px-6 text-center">
      <div>
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
        {devError ? (
          <p className="mt-4 whitespace-pre-wrap text-xs text-rose-500 dark:text-rose-400">
            Dev script error: {devError}
          </p>
        ) : null}
      </div>
    </div>
  );

  return (
    <div className="flex h-full flex-col bg-white dark:bg-neutral-950">
      <div className="border-b border-neutral-200 px-3 py-3 dark:border-neutral-800">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-6">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
              Preview
            </p>
            <p className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
              Port {port}
            </p>
            {devError ? (
              <p className="mt-1 whitespace-pre-wrap text-xs text-rose-500 dark:text-rose-400">
                Dev script error: {devError}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previewUrl ? (
              <Button
                asChild
                size="sm"
                variant="outline"
                className="gap-1.5"
              >
                <a href={previewUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  <span>Open in browser</span>
                </a>
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant={isTerminalOpen ? "default" : "outline"}
              className="gap-1.5"
              onClick={() => setIsTerminalOpen((value) => !value)}
            >
              <TerminalIcon className="h-4 w-4" />
              <span>{isTerminalOpen ? "Hide terminal" : "Show terminal"}</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 md:flex-row md:gap-0">
        <div className="min-h-0 flex-1">{previewContent}</div>
        {isTerminalOpen ? (
          <div className="min-h-[280px] border-neutral-200 md:min-h-0 md:flex-[0_0_420px] md:max-w-[520px] md:min-w-[320px] md:border-l dark:border-neutral-800">
            <DevTerminalView
              baseUrl={devTerminalUrl}
              className="h-[320px] w-full md:h-full"
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
