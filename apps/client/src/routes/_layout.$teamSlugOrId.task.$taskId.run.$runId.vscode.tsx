import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import z from "zod";
import type { PersistentIframeStatus } from "@/components/persistent-iframe";
import { PersistentWebView } from "@/components/persistent-webview";
import { getTaskRunPersistKey } from "@/lib/persistent-webview-keys";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import { toProxyWorkspaceUrl } from "@/lib/toProxyWorkspaceUrl";
import { useTheme } from "@/components/theme/use-theme";
import { persistentIframeManager } from "@/lib/persistentIframeManager";
import {
  preloadTaskRunIframes,
  TASK_RUN_IFRAME_ALLOW,
  TASK_RUN_IFRAME_SANDBOX,
} from "../lib/preloadTaskRunIframes";
import { shouldUseServerIframePreflight } from "@/hooks/useIframePreflight";
import {
  localVSCodeServeWebQueryOptions,
  useLocalVSCodeServeWebQuery,
} from "@/queries/local-vscode-serve-web";

const paramsSchema = z.object({
  taskId: typedZid("tasks"),
  runId: typedZid("taskRuns"),
});

export const Route = createFileRoute(
  "/_layout/$teamSlugOrId/task/$taskId/run/$runId/vscode"
)({
  component: VSCodeComponent,
  params: {
    parse: paramsSchema.parse,
    stringify: (params) => {
      return {
        taskId: params.taskId,
        runId: params.runId,
      };
    },
  },
  loader: async (opts) => {
    const [result, localServeWeb] = await Promise.all([
      opts.context.queryClient.ensureQueryData(
        convexQuery(api.taskRuns.get, {
          teamSlugOrId: opts.params.teamSlugOrId,
          id: opts.params.runId,
        })
      ),
      opts.context.queryClient.ensureQueryData(
        localVSCodeServeWebQueryOptions()
      ),
    ]);
    if (result) {
      const workspaceUrl = result.vscode?.workspaceUrl;
      void preloadTaskRunIframes([
        {
          url: workspaceUrl
            ? toProxyWorkspaceUrl(workspaceUrl, localServeWeb.baseUrl)
            : "",
          taskRunId: opts.params.runId,
        },
      ]);
    }
  },
});

function VSCodeComponent() {
  const { runId: taskRunId, teamSlugOrId } = Route.useParams();
  const localServeWeb = useLocalVSCodeServeWebQuery();
  const { resolvedTheme } = useTheme();
  const taskRun = useSuspenseQuery(
    convexQuery(api.taskRuns.get, {
      teamSlugOrId,
      id: taskRunId,
    })
  );

  const workspaceUrl = taskRun?.data?.vscode?.workspaceUrl
    ? toProxyWorkspaceUrl(
        taskRun.data.vscode.workspaceUrl,
        localServeWeb.data?.baseUrl
      )
    : null;
  const disablePreflight = taskRun?.data?.vscode?.workspaceUrl
    ? shouldUseServerIframePreflight(taskRun.data.vscode.workspaceUrl)
    : false;

  const persistKey = getTaskRunPersistKey(taskRunId);
  const hasWorkspace = workspaceUrl !== null;
  const isLocalWorkspace = taskRun?.data?.vscode?.provider === "other";

  const [iframeStatus, setIframeStatus] =
    useState<PersistentIframeStatus>("loading");
  useEffect(() => {
    setIframeStatus("loading");
  }, [workspaceUrl]);

  // Send theme changes to VSCode iframe via postMessage
  useEffect(() => {
    if (!hasWorkspace || iframeStatus !== "loaded" || !workspaceUrl) {
      return;
    }

    // Get iframe from the persistent iframe manager
    const iframe = persistentIframeManager.getIframe(persistKey);
    if (!iframe) {
      return;
    }

    try {
      const targetOrigin = new URL(workspaceUrl).origin;
      iframe.contentWindow?.postMessage(
        {
          type: "cmux:set-theme",
          theme: resolvedTheme,
        },
        targetOrigin
      );
    } catch (error) {
      console.error("Failed to send theme message to VSCode iframe:", error);
    }
  }, [resolvedTheme, hasWorkspace, iframeStatus, workspaceUrl, persistKey]);

  const onLoad = useCallback(() => {
    console.log(`Workspace view loaded for task run ${taskRunId}`);
  }, [taskRunId]);

  const onError = useCallback(
    (error: Error) => {
      console.error(
        `Failed to load workspace view for task run ${taskRunId}:`,
        error
      );
    },
    [taskRunId]
  );

  const loadingFallback = useMemo(
    () =>
      isLocalWorkspace
        ? null
        : <WorkspaceLoadingIndicator variant="vscode" status="loading" />,
    [isLocalWorkspace]
  );
  const errorFallback = useMemo(
    () => <WorkspaceLoadingIndicator variant="vscode" status="error" />,
    []
  );

  const isEditorBusy = !hasWorkspace || iframeStatus !== "loaded";

  return (
    <div className="flex flex-col grow bg-neutral-50 dark:bg-black">
      <div className="flex flex-col grow min-h-0 border-l border-neutral-200 dark:border-neutral-800">
        <div
          className="flex flex-row grow min-h-0 relative"
          aria-busy={isEditorBusy}
        >
          {workspaceUrl ? (
            <PersistentWebView
              persistKey={persistKey}
              src={workspaceUrl}
              className="grow flex"
              iframeClassName="select-none"
              sandbox={TASK_RUN_IFRAME_SANDBOX}
              allow={TASK_RUN_IFRAME_ALLOW}
              retainOnUnmount
              suspended={!hasWorkspace}
              preflight={!disablePreflight}
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
          {!hasWorkspace && !isLocalWorkspace ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <WorkspaceLoadingIndicator variant="vscode" status="loading" />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
