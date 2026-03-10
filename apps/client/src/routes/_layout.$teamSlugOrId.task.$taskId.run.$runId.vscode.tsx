import { api } from "@cmux/convex/api";
import { typedZid } from "@cmux/shared/utils/typed-zid";
import { convexQuery } from "@convex-dev/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSocket } from "@/contexts/socket/use-socket";
import z from "zod";
import type { PersistentIframeStatus } from "@/components/persistent-iframe";
import { PersistentWebView } from "@/components/persistent-webview";
import { getTaskRunPersistKey } from "@/lib/persistent-webview-keys";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import { getWorkspaceUrl } from "@/lib/workspace-url";
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
import { convexQueryClient } from "@/contexts/convex/convex-query-client";
import { ResumeWorkspaceOverlay } from "@/components/resume-workspace-overlay";
import { useElectronWindowFocus } from "@/hooks/useElectronWindowFocus";
import { isInteractiveFocusRetentionElement } from "@/lib/iframeFocusGuard";
import { persistentIframeManager } from "@/lib/persistentIframeManager";
import { focusWebview, isWebviewFocused } from "@/lib/webview-actions";

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
    convexQueryClient.convexClient.prewarmQuery({
      query: api.taskRuns.get,
      args: { teamSlugOrId: opts.params.teamSlugOrId, id: opts.params.runId },
    });

    void (async () => {
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
        const workspaceUrl = getWorkspaceUrl(
          result.vscode?.workspaceUrl,
          result.vscode?.provider,
          localServeWeb.baseUrl
        );
        if (workspaceUrl) {
          await preloadTaskRunIframes([
            {
              url: workspaceUrl,
              taskRunId: opts.params.runId,
            },
          ]);
        }
      }
    })();
  },
});

function VSCodeComponent() {
  const { runId: taskRunId, teamSlugOrId } = Route.useParams();
  const localServeWeb = useLocalVSCodeServeWebQuery();
  const taskRun = useQuery(api.taskRuns.get, {
    teamSlugOrId,
    id: taskRunId,
  });
  const { socket } = useSocket();

  // Query for linked local workspace to trigger sync
  const linkedLocalWorkspace = useQuery(
    api.tasks.getLinkedLocalWorkspace,
    { teamSlugOrId, cloudTaskRunId: taskRunId }
  );

  // Query workspace settings for auto-sync preference
  const workspaceSettings = useQuery(api.workspaceSettings.get, { teamSlugOrId });
  const autoSyncEnabled = workspaceSettings?.autoSyncEnabled ?? true;

  // Trigger sync when viewing a cloud task that has a linked local workspace
  // This restores the sync session after page refresh or server restart
  useEffect(() => {
    if (!autoSyncEnabled || !socket) {
      return;
    }

    const localWorkspacePath = linkedLocalWorkspace?.task?.worktreePath;
    if (!localWorkspacePath) {
      return;
    }

    socket.emit(
      "trigger-local-cloud-sync",
      {
        localWorkspacePath,
        cloudTaskRunId: taskRunId,
      },
      (response: { success: boolean; error?: string }) => {
        if (!response.success) {
          console.error("[VSCode route] Failed to trigger sync:", response.error);
        }
      }
    );
  }, [autoSyncEnabled, socket, linkedLocalWorkspace?.task?.worktreePath, taskRunId]);

  // Extract stable values from taskRun to avoid re-renders when unrelated fields change
  const rawWorkspaceUrl = taskRun?.vscode?.workspaceUrl;
  const vsCodeProvider = taskRun?.vscode?.provider;
  const vsCodeStatusMessage = taskRun?.vscode?.statusMessage;
  const taskRunStatus = taskRun?.status;
  const taskRunErrorMessage = taskRun?.errorMessage;
  const localServeWebBaseUrl = localServeWeb.data?.baseUrl;

  // Check if the task run failed (e.g., Docker pull failed)
  const hasTaskRunFailed = taskRunStatus === "failed";

  // Memoize the workspace URL to prevent unnecessary recalculations
  const workspaceUrl = useMemo(
    () => getWorkspaceUrl(rawWorkspaceUrl, vsCodeProvider, localServeWebBaseUrl),
    [rawWorkspaceUrl, vsCodeProvider, localServeWebBaseUrl]
  );

  const disablePreflight = useMemo(
    () => (rawWorkspaceUrl ? shouldUseServerIframePreflight(rawWorkspaceUrl) : false),
    [rawWorkspaceUrl]
  );

  const persistKey = getTaskRunPersistKey(taskRunId);
  const hasWorkspace = workspaceUrl !== null;
  const isLocalWorkspace = vsCodeProvider === "other";

  // Track iframe status - use state for rendering but with stable callback
  const [iframeStatus, setIframeStatus] =
    useState<PersistentIframeStatus>("loading");
  const prevWorkspaceUrlRef = useRef<string | null>(null);
  const persistKeyRef = useRef(persistKey);
  const focusRestorePrecheckTimeoutRef = useRef<number | null>(null);
  const focusRestoreTimeoutRef = useRef<number | null>(null);
  const shouldRestoreWorkspaceFocusOnWindowRefocusRef = useRef(false);
  const userInteractionCountRef = useRef(0);

  const clearPendingFocusRestore = useCallback(() => {
    if (focusRestorePrecheckTimeoutRef.current !== null) {
      clearTimeout(focusRestorePrecheckTimeoutRef.current);
      focusRestorePrecheckTimeoutRef.current = null;
    }
    if (focusRestoreTimeoutRef.current !== null) {
      clearTimeout(focusRestoreTimeoutRef.current);
      focusRestoreTimeoutRef.current = null;
    }
  }, []);

  const tryRestoreWorkspaceFocus = useCallback(async (): Promise<boolean> => {
    if (typeof document === "undefined" || !hasWorkspace || iframeStatus !== "loaded") {
      return false;
    }

    const currentPersistKey = persistKeyRef.current;
    if (
      !currentPersistKey ||
      isInteractiveFocusRetentionElement(document.activeElement)
    ) {
      return false;
    }

    const focused = await isWebviewFocused(currentPersistKey);
    if (
      focused ||
      isInteractiveFocusRetentionElement(document.activeElement)
    ) {
      return focused;
    }

    return focusWebview(currentPersistKey);
  }, [hasWorkspace, iframeStatus]);

  useEffect(() => {
    clearPendingFocusRestore();
    persistKeyRef.current = persistKey;
    shouldRestoreWorkspaceFocusOnWindowRefocusRef.current = false;
  }, [clearPendingFocusRestore, persistKey]);

  useEffect(() => {
    clearPendingFocusRestore();
    if (!hasWorkspace || iframeStatus !== "loaded") {
      shouldRestoreWorkspaceFocusOnWindowRefocusRef.current = false;
    }
  }, [clearPendingFocusRestore, hasWorkspace, iframeStatus]);

  // Only reset to loading when the URL actually changes to a different value
  // This prevents flickering when the URL reference changes but the value is the same
  useEffect(() => {
    if (workspaceUrl !== prevWorkspaceUrlRef.current) {
      // Only reset to loading if we're transitioning to a new URL
      // Don't reset if we're already loaded with the same URL
      if (workspaceUrl !== null && prevWorkspaceUrlRef.current !== null) {
        setIframeStatus("loading");
      }
      prevWorkspaceUrlRef.current = workspaceUrl;
    }
  }, [workspaceUrl]);

  // Stable callback for status changes - setIframeStatus is already stable
  const handleStatusChange = useCallback(
    (status: PersistentIframeStatus) => {
      setIframeStatus(status);
    },
    []
  );

  const handleWorkspaceActivate = useCallback(() => {
    shouldRestoreWorkspaceFocusOnWindowRefocusRef.current = true;
  }, []);

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

  useEffect(() => {
    return clearPendingFocusRestore;
  }, [clearPendingFocusRestore]);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const markUserInteraction = () => {
      userInteractionCountRef.current += 1;
    };

    document.addEventListener("pointerdown", markUserInteraction, true);
    document.addEventListener("keydown", markUserInteraction, true);

    return () => {
      document.removeEventListener("pointerdown", markUserInteraction, true);
      document.removeEventListener("keydown", markUserInteraction, true);
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const getWorkspaceIframe = (): HTMLIFrameElement | null => {
      const currentPersistKey = persistKeyRef.current;
      if (!currentPersistKey) {
        return null;
      }

      return persistentIframeManager.getIframeElement(currentPersistKey);
    };

    const isWorkspaceTarget = (target: EventTarget | null) => {
      const workspaceIframe = getWorkspaceIframe();
      return workspaceIframe !== null && target === workspaceIframe;
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (isWorkspaceTarget(event.target)) {
        return;
      }
      shouldRestoreWorkspaceFocusOnWindowRefocusRef.current = false;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (isWorkspaceTarget(event.target)) {
        return;
      }
      shouldRestoreWorkspaceFocusOnWindowRefocusRef.current = false;
    };

    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("pointerdown", handlePointerDown, true);

    return () => {
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const handleWindowBlur = () => {
      clearPendingFocusRestore();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        return;
      }
      clearPendingFocusRestore();
    };

    window.addEventListener("blur", handleWindowBlur);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("blur", handleWindowBlur);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [clearPendingFocusRestore]);

  useElectronWindowFocus(
    useCallback(() => {
      if (typeof document === "undefined") {
        return;
      }

      if (!shouldRestoreWorkspaceFocusOnWindowRefocusRef.current) {
        return;
      }

      clearPendingFocusRestore();

      const currentPersistKey = persistKeyRef.current;
      if (
        !currentPersistKey ||
        !hasWorkspace ||
        iframeStatus !== "loaded" ||
        !shouldRestoreWorkspaceFocusOnWindowRefocusRef.current
      ) {
        return;
      }

      const interactionCountAtWindowFocus = userInteractionCountRef.current;

      focusRestorePrecheckTimeoutRef.current = window.setTimeout(() => {
        focusRestorePrecheckTimeoutRef.current = null;

        if (
          typeof document === "undefined" ||
          document.visibilityState !== "visible" ||
          !document.hasFocus() ||
          userInteractionCountRef.current !== interactionCountAtWindowFocus ||
          !shouldRestoreWorkspaceFocusOnWindowRefocusRef.current
        ) {
          return;
        }

        if (isInteractiveFocusRetentionElement(document.activeElement)) {
          return;
        }

        focusRestoreTimeoutRef.current = window.setTimeout(() => {
          focusRestoreTimeoutRef.current = null;

          if (
            typeof document === "undefined" ||
            document.visibilityState !== "visible" ||
            !document.hasFocus() ||
            userInteractionCountRef.current !== interactionCountAtWindowFocus ||
            !shouldRestoreWorkspaceFocusOnWindowRefocusRef.current ||
            isInteractiveFocusRetentionElement(document.activeElement)
          ) {
            return;
          }

          void tryRestoreWorkspaceFocus().catch((error) => {
            console.warn(
              `Failed to restore workspace webview focus for task run ${taskRunId}`,
              error
            );
          });
        }, 150);
      }, 10);
    }, [clearPendingFocusRestore, hasWorkspace, iframeStatus, taskRunId, tryRestoreWorkspaceFocus])
  );

  const loadingFallback = useMemo(
    () =>
      isLocalWorkspace ? null : (
        <WorkspaceLoadingIndicator
          variant="vscode"
          status="loading"
          loadingDescription={vsCodeStatusMessage}
        />
      ),
    [isLocalWorkspace, vsCodeStatusMessage]
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
              onStatusChange={handleStatusChange}
              onActivate={handleWorkspaceActivate}
              loadTimeoutMs={60_000}
            />
          ) : (
            <div className="grow" />
          )}
          {!hasWorkspace && !isLocalWorkspace ? (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <WorkspaceLoadingIndicator
                variant="vscode"
                status={hasTaskRunFailed ? "error" : "loading"}
                loadingDescription={vsCodeStatusMessage}
                errorDescription={taskRunErrorMessage ?? undefined}
              />
            </div>
          ) : null}
          {taskRun ? (
            <ResumeWorkspaceOverlay
              taskRun={taskRun}
              teamSlugOrId={teamSlugOrId}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
