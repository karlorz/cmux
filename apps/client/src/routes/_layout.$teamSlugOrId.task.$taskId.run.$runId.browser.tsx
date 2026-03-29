import type { PersistentIframeStatus } from "@/components/persistent-iframe";
import { PersistentWebView } from "@/components/persistent-webview";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import { useVncClipboardBridge } from "@/hooks/useVncClipboardBridge";
import { addBrowserReloadListener } from "@/lib/browser-reload-events";
import { persistentIframeManager } from "@/lib/persistentIframeManager";
import { getTaskRunBrowserPersistKey } from "@/lib/persistent-webview-keys";
import {
  TASK_RUN_IFRAME_ALLOW,
  TASK_RUN_IFRAME_SANDBOX,
} from "@/lib/preloadTaskRunIframes";
import {
  resolveBrowserPreviewUrl,
  resolveBrowserPreviewWebsocketUrl,
} from "@/lib/toProxyWorkspaceUrl";
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { api } from "@cmux/convex/api";
import {
  VncViewer,
  type VncConnectionStatus,
  type VncViewerHandle,
} from "@cmux/shared/components/vnc-viewer";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { createFileRoute } from "@tanstack/react-router";
import clsx from "clsx";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import z from "zod";

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
  const rawBrowserUrl = vscodeInfo?.url ?? vscodeInfo?.workspaceUrl ?? null;
  const browserUrl = useMemo(
    () =>
      resolveBrowserPreviewUrl({
        vncUrl: vscodeInfo?.vncUrl,
        workspaceUrl: rawBrowserUrl,
      }),
    [vscodeInfo?.vncUrl, rawBrowserUrl]
  );

  const vncWebsocketUrl = useMemo(
    () =>
      resolveBrowserPreviewWebsocketUrl({
        vncUrl: vscodeInfo?.vncUrl,
        workspaceUrl: rawBrowserUrl,
      }),
    [vscodeInfo?.vncUrl, rawBrowserUrl]
  );

  const useDirectVncViewer = Boolean(vncWebsocketUrl);

  const persistKey = useMemo(
    () => getTaskRunBrowserPersistKey(taskRunId),
    [taskRunId]
  );

  // Direct VNC panels use the React viewer and don't need the iframe clipboard bridge.
  const isVncIframe = !useDirectVncViewer && Boolean(browserUrl?.includes("/vnc.html"));
  useVncClipboardBridge({
    persistKey,
    enabled: isVncIframe,
  });

  const hasBrowserView = Boolean(browserUrl);
  const isSupportedProvider =
    vscodeInfo?.provider === "morph" || vscodeInfo?.provider === "pve-lxc";
  const showLoader = isSupportedProvider && !hasBrowserView;

  const [browserStatus, setBrowserStatus] =
    useState<PersistentIframeStatus>("loading");
  const [vncStatus, setVncStatus] = useState<VncConnectionStatus>("disconnected");
  const vncViewerRef = useRef<VncViewerHandle | null>(null);

  const overlayMessage = useMemo(() => {
    if (!isSupportedProvider) {
      return "Browser preview is not available for this sandbox provider.";
    }
    if (!hasBrowserView) {
      return "Waiting for the workspace to expose a browser preview...";
    }
    return "Launching browser preview...";
  }, [hasBrowserView, isSupportedProvider]);

  const onLoad = useCallback(() => {
    console.log(`Browser preview loaded for task run ${taskRunId}`);
  }, [taskRunId]);

  const onError = useCallback(
    (error: Error) => {
      console.error(
        `Failed to load browser preview for task run ${taskRunId}:`,
        error
      );
    },
    [taskRunId]
  );

  useEffect(() => {
    return addBrowserReloadListener((runId) => {
      if (runId !== taskRunId) return;
      const previousFocus = document.activeElement;
      if (useDirectVncViewer) {
        const viewer = vncViewerRef.current;
        if (!viewer) return;
        viewer.disconnect();
        viewer.connect();
        requestAnimationFrame(() => {
          if (
            previousFocus instanceof HTMLElement &&
            document.activeElement !== previousFocus
          ) {
            previousFocus.focus({ preventScroll: true });
          }
        });
        return;
      }
      const reloaded = persistentIframeManager.reloadIframe(persistKey);
      if (!reloaded) return;
      requestAnimationFrame(() => {
        if (
          previousFocus instanceof HTMLElement &&
          document.activeElement !== previousFocus
        ) {
          previousFocus.focus({ preventScroll: true });
        }
      });
    });
  }, [persistKey, taskRunId, useDirectVncViewer]);

  const loadingFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="browser" status="loading" />,
    []
  );
  const errorFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="browser" status="error" />,
    []
  );

  const hasBrowserConnection = Boolean(vncWebsocketUrl || browserUrl);
  const isBrowserBusy = useDirectVncViewer
    ? !hasBrowserConnection || vncStatus !== "connected"
    : !hasBrowserConnection || browserStatus !== "loaded";

  return (
    <div className="flex flex-col grow bg-neutral-50 dark:bg-black">
      <div className="flex flex-col grow min-h-0 border-l border-neutral-200 dark:border-neutral-800">
        <div
          className="flex flex-row grow min-h-0 relative"
          aria-busy={isBrowserBusy}
        >
          {useDirectVncViewer && vncWebsocketUrl ? (
            <VncViewer
              ref={vncViewerRef}
              url={vncWebsocketUrl}
              autoConnect
              scaleViewport
              className="grow flex"
              loadingFallback={loadingFallback}
              errorFallback={errorFallback}
              onStatusChange={setVncStatus}
            />
          ) : browserUrl ? (
            <PersistentWebView
              key={persistKey}
              persistKey={persistKey}
              src={browserUrl}
              className="grow flex"
              iframeClassName="select-none"
              allow={TASK_RUN_IFRAME_ALLOW}
              sandbox={TASK_RUN_IFRAME_SANDBOX}
              retainOnUnmount
              onLoad={onLoad}
              onError={onError}
              onStatusChange={setBrowserStatus}
              fallback={loadingFallback}
              fallbackClassName="bg-neutral-50 dark:bg-black"
              errorFallback={errorFallback}
              errorFallbackClassName="bg-neutral-50/95 dark:bg-black/95"
              loadTimeoutMs={45_000}
            />
          ) : (
            <div className="grow" />
          )}
          <div
            className={clsx(
              "absolute inset-0 flex items-center justify-center transition pointer-events-none",
              {
                "opacity-100": !hasBrowserView,
                "opacity-0": hasBrowserView,
              }
            )}
          >
            {showLoader && !hasBrowserConnection ? (
              <WorkspaceLoadingIndicator variant="browser" status="loading" />
            ) : !hasBrowserConnection ? (
              <span className="text-sm text-neutral-500 dark:text-neutral-400 text-center px-4">
                {overlayMessage}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
