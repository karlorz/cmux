import { PersistentWebView } from "@/components/persistent-webview";
import { ElectronPreviewBrowser } from "@/components/electron-preview-browser";
import type { PersistentIframeStatus } from "@/components/persistent-iframe";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import {
  getTaskRunBrowserPersistKey,
  getTaskRunBrowserWebContentsPersistKey,
} from "@/lib/persistent-webview-keys";
import {
  TASK_RUN_IFRAME_ALLOW,
  TASK_RUN_IFRAME_SANDBOX,
} from "@/lib/preloadTaskRunIframes";
import { toMorphVncUrl } from "@/lib/toProxyWorkspaceUrl";
import { isElectron } from "@/lib/electron";
import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import z from "zod";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { useQuery } from "convex/react";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
});

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/browser"
)({
  component: BrowserComponent,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => ({
      taskId: params.taskId,
      runId: params.runId,
    }),
  },
  loader: async (opts) => {
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRuns.get,
      args: { teamSlugOrId: opts.params.teamSlugOrId, id: opts.params.runId },
    });
  },
});

function BrowserComponent() {
  const { runId: taskRunId, teamSlugOrId } = Route.useParams();
  const taskRun = useQuery(api.taskRuns.get, {
    teamSlugOrId,
    id: taskRunId,
  });

  const vscodeInfo = taskRun?.vscode ?? null;
  const rawMorphUrl = vscodeInfo?.url ?? vscodeInfo?.workspaceUrl ?? null;
  const vncUrl = useMemo(() => {
    if (!rawMorphUrl) {
      return null;
    }
    return toMorphVncUrl(rawMorphUrl);
  }, [rawMorphUrl]);

  const persistKey = getTaskRunBrowserPersistKey(taskRunId);
  const webContentsPersistKey =
    getTaskRunBrowserWebContentsPersistKey(taskRunId);
  const hasBrowserView = Boolean(vncUrl);
  const isMorphProvider = vscodeInfo?.provider === "morph";
  const showLoader = isMorphProvider && !hasBrowserView;

  const [iframeStatus, setIframeStatus] =
    useState<PersistentIframeStatus>("loading");

  useEffect(() => {
    setIframeStatus("loading");
  }, [vncUrl]);

  const overlayMessage = useMemo(() => {
    if (!isMorphProvider) {
      return "Browser preview is loading. Note that browser preview is only supported in cloud mode.";
    }
    if (!hasBrowserView) {
      return "Waiting for the workspace to expose a browser preview...";
    }
    return "Launching browser preview...";
  }, [hasBrowserView, isMorphProvider]);

  const onLoad = useCallback(() => {
    console.log(`Browser view loaded for task run ${taskRunId}`);
  }, [taskRunId]);

  const onError = useCallback(
    (error: Error) => {
      console.error(
        `Failed to load browser view for task run ${taskRunId}:`,
        error
      );
    },
    [taskRunId]
  );

  const loadingFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="browser" status="loading" />,
    []
  );
  const errorFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="browser" status="error" />,
    []
  );

  const isBrowserBusy = !hasBrowserView || iframeStatus !== "loaded";
  const networking = taskRun?.networking ?? null;
  const defaultPreviewTarget = useMemo(() => {
    if (!networking?.length) {
      return null;
    }
    const running = networking.find(
      (service) => service.status === "running" && service.url
    );
    const fallback = networking.find((service) => service.url);
    const chosen = running ?? fallback ?? null;
    if (!chosen) {
      return null;
    }
    const displayUrl =
      typeof chosen.port === "number" && Number.isFinite(chosen.port)
        ? `http://localhost:${chosen.port}`
        : chosen.url;
    return {
      port: chosen.port,
      remoteUrl: chosen.url,
      displayUrl,
    };
  }, [networking]);
  const runningPorts = useMemo(
    () =>
      networking?.filter((service) => service.status === "running") ?? [],
    [networking]
  );
  const showWebContentsBrowser = Boolean(
    isElectron && isMorphProvider && webContentsPersistKey
  );
  const resolvedWebContentsPersistKey = showWebContentsBrowser
    ? webContentsPersistKey
    : null;
  const webContentsDisplayUrl =
    defaultPreviewTarget?.displayUrl ?? "https://example.com/";
  const webContentsRequestUrl = defaultPreviewTarget?.remoteUrl;

  return (
    <div className="flex flex-col grow bg-neutral-50 dark:bg-black">
      <div className="flex flex-col grow min-h-0 border-l border-neutral-200 dark:border-neutral-800">
        <div
          className="flex flex-col grow min-h-0 gap-3"
          aria-busy={isBrowserBusy}
        >
          <div className="relative flex-1 min-h-[240px]">
            {vncUrl ? (
              <PersistentWebView
                persistKey={persistKey}
                src={vncUrl}
                className="grow flex relative"
                iframeClassName="select-none"
                sandbox={TASK_RUN_IFRAME_SANDBOX}
                allow={TASK_RUN_IFRAME_ALLOW}
                retainOnUnmount
                onLoad={onLoad}
                onError={onError}
                fallback={loadingFallback}
                fallbackClassName="bg-neutral-50 dark:bg-black"
                errorFallback={errorFallback}
                errorFallbackClassName="bg-neutral-50/95 dark:bg-black/95"
                onStatusChange={setIframeStatus}
                loadTimeoutMs={60_000}
              />
            ) : (
              <div className="grow" />
            )}
            <div
              className={clsx(
                "pointer-events-none absolute inset-0 flex items-center justify-center transition",
                {
                  "opacity-100": !hasBrowserView,
                  "opacity-0": hasBrowserView,
                }
              )}
            >
              {showLoader ? (
                <WorkspaceLoadingIndicator variant="browser" status="loading" />
              ) : (
                <span className="px-4 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  {overlayMessage}
                </span>
              )}
            </div>
          </div>
          {showWebContentsBrowser && resolvedWebContentsPersistKey ? (
            <div className="flex flex-1 min-h-[220px] flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-950">
              <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                <span>WebContents Browser</span>
                {defaultPreviewTarget?.port ? (
                  <span className="text-[11px] font-normal text-neutral-400 dark:text-neutral-500">
                    Default port {defaultPreviewTarget.port}
                  </span>
                ) : null}
              </div>
              <div className="flex-1 min-h-0">
                <ElectronPreviewBrowser
                  persistKey={resolvedWebContentsPersistKey}
                  src={webContentsDisplayUrl}
                  requestUrl={webContentsRequestUrl}
                />
              </div>
              <div className="border-t border-neutral-200 bg-neutral-50/80 px-3 py-2 text-[11px] text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
                {runningPorts.length ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-500">
                      Ports
                    </span>
                    {runningPorts.map((service) => (
                      <span
                        key={service.port}
                        className="rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-medium text-neutral-700 shadow-sm dark:bg-neutral-800 dark:text-neutral-200"
                      >
                        {service.port}
                      </span>
                    ))}
                    <span className="opacity-80">
                      Visit <code>http://localhost:PORT</code> above or enter
                      any URL.
                    </span>
                  </div>
                ) : (
                  <span>
                    Expose a port in the workspace to browse it directly, or
                    paste any URL above.
                  </span>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
