import type { FSWatcher } from "node:fs";

// Watch for the completion marker file that signals Kimi CLI has finished.
// Since Kimi CLI runs in --print mode, it will exit when done, and we can
// detect completion by watching for the marker file created by our hook.
export function startKimiCompletionDetector(taskRunId: string): Promise<void> {
  const markerPath = `/root/lifecycle/kimi-complete-${taskRunId}`;
  let watcher: FSWatcher | null = null;
  let stopped = false;

  return new Promise<void>((resolve, reject) => {
    void (async () => {
      try {
        const fs = await import("node:fs");
        const { watch, promises: fsp } = fs;

        const stop = () => {
          stopped = true;
          try {
            watcher?.close();
          } catch {
            // ignore
          }
          watcher = null;
        };

        // Check if marker file already exists
        try {
          await fsp.access(markerPath);
          if (!stopped) {
            stop();
            resolve();
            return;
          }
        } catch {
          // Marker doesn't exist yet, continue watching
        }

        // Watch the lifecycle directory for the marker file
        watcher = watch(
          "/root/lifecycle",
          { persistent: false },
          (_event, filename) => {
            if (stopped) return;
            if (filename?.toString() === `kimi-complete-${taskRunId}`) {
              stop();
              resolve();
            }
          }
        );
      } catch (e) {
        reject(e instanceof Error ? e : new Error(String(e)));
      }
    })();
  });
}
