import React, { useState, useCallback, useMemo } from "react";
import { Code2, Globe2, Maximize2, Columns2 } from "lucide-react";
import clsx from "clsx";
import { ResizableRows } from "@/components/ResizableRows";
import { PersistentWebView } from "@/components/persistent-webview";
import { WorkspaceLoadingIndicator } from "@/components/workspace-loading-indicator";
import {
  TASK_RUN_IFRAME_ALLOW,
  TASK_RUN_IFRAME_SANDBOX,
} from "@/lib/preloadTaskRunIframes";
import type { PersistentIframeStatus } from "@/components/persistent-iframe";

type ViewMode = "split" | "vscode" | "browser";

interface EnvironmentSetupSplitViewProps {
  vscodeUrl?: string;
  browserUrl?: string;
  instanceId?: string;
  onVscodeLoad?: () => void;
  onVscodeError?: (error: Error) => void;
  onBrowserLoad?: () => void;
  onBrowserError?: (error: Error) => void;
  className?: string;
}

export function EnvironmentSetupSplitView({
  vscodeUrl,
  browserUrl,
  instanceId,
  onVscodeLoad,
  onVscodeError,
  onBrowserLoad,
  onBrowserError,
  className,
}: EnvironmentSetupSplitViewProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [vscodeStatus, setVscodeStatus] = useState<PersistentIframeStatus>("loading");
  const [browserStatus, setBrowserStatus] = useState<PersistentIframeStatus>("loading");

  const basePersistKey = useMemo(() => {
    if (instanceId) return `env-setup:${instanceId}`;
    if (vscodeUrl) return `env-setup:${vscodeUrl}`;
    if (browserUrl) return `env-setup:${browserUrl}`;
    return "env-setup";
  }, [browserUrl, instanceId, vscodeUrl]);

  const vscodePersistKey = `${basePersistKey}:vscode`;
  const browserPersistKey = `${basePersistKey}:browser`;

  const handleVscodeLoad = useCallback(() => {
    setVscodeStatus("loaded");
    onVscodeLoad?.();
  }, [onVscodeLoad]);

  const handleVscodeError = useCallback((error: Error) => {
    console.error("Failed to load VS Code workspace iframe", error);
    setVscodeStatus("error");
    onVscodeError?.(error);
  }, [onVscodeError]);

  const handleBrowserLoad = useCallback(() => {
    setBrowserStatus("loaded");
    onBrowserLoad?.();
  }, [onBrowserLoad]);

  const handleBrowserError = useCallback((error: Error) => {
    console.error("Failed to load browser workspace iframe", error);
    setBrowserStatus("error");
    onBrowserError?.(error);
  }, [onBrowserError]);

  const renderVscodePanel = useCallback((isVisible: boolean) => {
    if (!vscodeUrl) {
      return (
        <div className="flex h-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <WorkspaceLoadingIndicator variant="vscode" status="loading" />
        </div>
      );
    }

    return (
      <div
        className={clsx(
          "relative h-full bg-neutral-50 dark:bg-neutral-950",
          !isVisible && "hidden"
        )}
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
            <div className="flex items-center gap-2">
              <Code2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                VS Code Instance
              </span>
            </div>
          </div>
          <div className="flex-1 relative">
            <PersistentWebView
              persistKey={vscodePersistKey}
              src={vscodeUrl}
              className="absolute inset-0"
              iframeClassName="w-full h-full border-0"
              allow={TASK_RUN_IFRAME_ALLOW}
              sandbox={TASK_RUN_IFRAME_SANDBOX}
              retainOnUnmount
              onLoad={handleVscodeLoad}
              onError={handleVscodeError}
              onStatusChange={setVscodeStatus}
              loadTimeoutMs={60_000}
              fallback={<WorkspaceLoadingIndicator variant="vscode" status="loading" />}
              fallbackClassName="bg-neutral-50 dark:bg-neutral-950"
              errorFallback={<WorkspaceLoadingIndicator variant="vscode" status="error" />}
              errorFallbackClassName="bg-neutral-50/95 dark:bg-neutral-950/95"
            />
          </div>
        </div>
      </div>
    );
  }, [vscodeUrl, vscodePersistKey, handleVscodeLoad, handleVscodeError]);

  const renderBrowserPanel = useCallback((isVisible: boolean) => {
    if (!browserUrl) {
      return (
        <div className="flex h-full items-center justify-center bg-neutral-50 dark:bg-neutral-950">
          <WorkspaceLoadingIndicator variant="browser" status="loading" />
        </div>
      );
    }

    return (
      <div
        className={clsx(
          "relative h-full bg-neutral-50 dark:bg-neutral-950",
          !isVisible && "hidden"
        )}
      >
        <div className="absolute inset-0 flex flex-col">
          <div className="flex items-center justify-between border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-3 py-2">
            <div className="flex items-center gap-2">
              <Globe2 className="h-4 w-4 text-neutral-600 dark:text-neutral-400" />
              <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                Browser VNC
              </span>
            </div>
            <div className="text-xs text-neutral-500 dark:text-neutral-400">
              Setup browser for agent screenshots and authentication
            </div>
          </div>
          <div className="flex-1 relative">
            <PersistentWebView
              persistKey={browserPersistKey}
              src={browserUrl}
              className="absolute inset-0"
              iframeClassName="w-full h-full border-0"
              allow={TASK_RUN_IFRAME_ALLOW}
              sandbox={TASK_RUN_IFRAME_SANDBOX}
              retainOnUnmount
              onLoad={handleBrowserLoad}
              onError={handleBrowserError}
              onStatusChange={setBrowserStatus}
              loadTimeoutMs={60_000}
              fallback={<WorkspaceLoadingIndicator variant="browser" status="loading" />}
              fallbackClassName="bg-neutral-50 dark:bg-neutral-950"
              errorFallback={<WorkspaceLoadingIndicator variant="browser" status="error" />}
              errorFallbackClassName="bg-neutral-50/95 dark:bg-neutral-950/95"
            />
          </div>
        </div>
      </div>
    );
  }, [browserUrl, browserPersistKey, handleBrowserLoad, handleBrowserError]);

  const renderViewModeControls = () => {
    return (
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-sm p-1 shadow-lg">
        <button
          type="button"
          onClick={() => setViewMode("split")}
          className={clsx(
            "flex items-center justify-center rounded p-1.5 transition-colors",
            viewMode === "split"
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          )}
          title="Split view"
          aria-pressed={viewMode === "split"}
        >
          <Columns2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("vscode")}
          className={clsx(
            "flex items-center justify-center rounded p-1.5 transition-colors",
            viewMode === "vscode"
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          )}
          title="VS Code only"
          aria-pressed={viewMode === "vscode"}
        >
          <Code2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setViewMode("browser")}
          className={clsx(
            "flex items-center justify-center rounded p-1.5 transition-colors",
            viewMode === "browser"
              ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
              : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          )}
          title="Browser VNC only"
          aria-pressed={viewMode === "browser"}
          disabled={!browserUrl}
        >
          <Globe2 className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className={clsx("relative h-full w-full", className)}>
      {renderViewModeControls()}
      {viewMode === "split" ? (
        <ResizableRows
          storageKey="environment-setup-split"
          defaultTopHeight={50}
          minTop={20}
          maxTop={80}
          top={renderVscodePanel(true)}
          bottom={renderBrowserPanel(true)}
        />
      ) : viewMode === "vscode" ? (
        renderVscodePanel(true)
      ) : (
        renderBrowserPanel(true)
      )}
    </div>
  );
}
