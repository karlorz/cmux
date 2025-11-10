import { PERMISSIVE_IFRAME_ALLOW, PERMISSIVE_IFRAME_SANDBOX } from "./iframePermissions";
import { persistentIframeManager } from "./persistentIframeManager";
import {
  getTaskRunBrowserPersistKey,
  getTaskRunPersistKey,
} from "./persistent-webview-keys";

/**
 * Preload iframes for task runs
 * @param taskRunIds - Array of task run IDs to preload
 * @returns Promise that resolves when all iframes are loaded
 */
export const TASK_RUN_IFRAME_ALLOW = PERMISSIVE_IFRAME_ALLOW;

export const TASK_RUN_IFRAME_SANDBOX = PERMISSIVE_IFRAME_SANDBOX;

type TaskRunIframeKind = "workspace" | "browser";

function resolvePersistKey(
  taskRunId: string,
  kind: TaskRunIframeKind = "workspace"
): string {
  if (kind === "browser") {
    return getTaskRunBrowserPersistKey(taskRunId);
  }
  return getTaskRunPersistKey(taskRunId);
}

export async function preloadTaskRunIframes(
  data: { url: string; taskRunId: string; kind?: TaskRunIframeKind }[]
): Promise<void> {
  const entries = data.map(({ url, taskRunId, kind }) => {
    const key = resolvePersistKey(taskRunId, kind);
    return {
      key,
      url,
      allow: TASK_RUN_IFRAME_ALLOW,
      sandbox: TASK_RUN_IFRAME_SANDBOX,
    };
  });

  await persistentIframeManager.preloadMultiple(entries);
}

/**
 * Preload a single task run iframe
 * @param taskRunId - Task run ID to preload
 * @returns Promise that resolves when the iframe is loaded
 */
export async function preloadTaskRunIframe(
  taskRunId: string,
  url: string,
  kind: TaskRunIframeKind = "workspace"
): Promise<void> {
  await persistentIframeManager.preloadIframe(
    resolvePersistKey(taskRunId, kind),
    url,
    {
      allow: TASK_RUN_IFRAME_ALLOW,
      sandbox: TASK_RUN_IFRAME_SANDBOX,
    }
  );
}

/**
 * Remove a task run iframe from memory
 * @param taskRunId - Task run ID to remove
 */
export function removeTaskRunIframe(taskRunId: string): void {
  persistentIframeManager.removeIframe(getTaskRunPersistKey(taskRunId));
}

/**
 * Get all currently loaded task run iframe keys
 * @returns Array of task run IDs that have loaded iframes
 */
export function getLoadedTaskRunIframes(): string[] {
  return persistentIframeManager
    .getLoadedKeys()
    .filter((key) => key.startsWith("task-run:"))
    .map((key) => key.replace("task-run:", ""));
}
