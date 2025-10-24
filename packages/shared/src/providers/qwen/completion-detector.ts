import type { FSWatcher } from "node:fs";

// How long to wait for telemetry file before giving up (ms)
const TELEMETRY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
// How often to poll for the file if watcher doesn't fire (ms)
const POLL_INTERVAL_MS = 2000; // 2 seconds

const DEBUG = process.env.CMUX_DEBUG_COMPLETION === "1";
const log = (...args: unknown[]) => {
  if (DEBUG) {
    console.error("[qwen-completion-detector]", ...args);
  }
};

// Watch Qwen CLI local telemetry for the "next speaker: user" signal.
// Mirrors the Gemini detector but targets a Qwen-specific outfile.
export function startQwenCompletionDetector(taskRunId: string): Promise<void> {
  const telemetryPath = `/tmp/qwen-telemetry-${taskRunId}.log`;
  let fileWatcher: FSWatcher | null = null;
  let dirWatcher: FSWatcher | null = null;
  let pollInterval: NodeJS.Timeout | null = null;
  let timeoutHandle: NodeJS.Timeout | null = null;

  return new Promise<void>((resolve, reject) => {
    void (async () => {
      const path = await import("node:path");
      const fs = await import("node:fs");
      const { watch, createReadStream, promises: fsp } = fs;

      let stopped = false;
      let lastSize = 0;
      let eventsProcessed = 0;

      const dir = path.dirname(telemetryPath);
      const file = path.basename(telemetryPath);

      log(`Starting completion detector for task ${taskRunId}`);
      log(`Watching telemetry file: ${telemetryPath}`);

      // Cleanup function to stop all watchers and timers
      const cleanup = () => {
        if (stopped) return;
        stopped = true;
        log("Cleaning up watchers and timers");
        try {
          fileWatcher?.close();
        } catch (e) {
          log("Error closing file watcher:", e);
        }
        try {
          dirWatcher?.close();
        } catch (e) {
          log("Error closing dir watcher:", e);
        }
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      // Set up timeout to reject if detection takes too long
      timeoutHandle = setTimeout(() => {
        if (!stopped) {
          log(
            `Timeout waiting for completion event after ${TELEMETRY_TIMEOUT_MS}ms`
          );
          log(`Events processed: ${eventsProcessed}`);
          log(`File size at timeout: ${lastSize} bytes`);
          cleanup();
          reject(
            new Error(
              `Qwen completion detection timed out after ${TELEMETRY_TIMEOUT_MS}ms`
            )
          );
        }
      }, TELEMETRY_TIMEOUT_MS);

      // Lightweight JSON object stream parser for concatenated objects
      let buf = "";
      let depth = 0;
      let inString = false;
      let escape = false;
      const feed = (chunk: string, onObject: (obj: unknown) => void) => {
        for (let i = 0; i < chunk.length; i++) {
          const ch = chunk[i];
          if (inString) {
            buf += ch;
            if (escape) {
              escape = false;
            } else if (ch === "\\") {
              escape = true;
            } else if (ch === '"') {
              inString = false;
            }
            continue;
          }
          if (ch === '"') {
            inString = true;
            if (depth > 0) buf += ch;
            continue;
          }
          if (ch === "{") {
            depth++;
            buf += ch;
            continue;
          }
          if (ch === "}") {
            depth--;
            buf += ch;
            if (depth === 0) {
              try {
                const obj = JSON.parse(buf);
                onObject(obj);
              } catch (e) {
                log("JSON parse error:", e, "Buffer:", buf.slice(0, 200));
              }
              buf = "";
            }
            continue;
          }
          if (depth > 0) buf += ch;
        }
      };

      const isCompletionEvent = (event: unknown): boolean => {
        if (!event || typeof event !== "object") {
          return false;
        }
        const anyEvent = event as Record<string, unknown>;
        const attrs =
          (anyEvent.attributes as Record<string, unknown>) ||
          (anyEvent.resource &&
            (anyEvent.resource as Record<string, unknown>).attributes) ||
          (anyEvent.body &&
            (anyEvent.body as Record<string, unknown>).attributes);

        if (!attrs || typeof attrs !== "object") {
          return false;
        }

        const a = attrs as Record<string, unknown>;
        const eventName = (a["event.name"] || a["event_name"]) as
          | string
          | undefined;
        const result = a["result"] as string | undefined;

        // Accept both Gemini-style and Qwen-style event namespaces, and a generic suffix.
        const nameOk = Boolean(
          eventName === "gemini_cli.next_speaker_check" ||
            eventName === "qwen_cli.next_speaker_check" ||
            (typeof eventName === "string" &&
              eventName.endsWith(".next_speaker_check"))
        );
        const isMatch = nameOk && result === "user";

        if (DEBUG && eventName) {
          log(
            `Event: ${eventName}, result: ${result}, isMatch: ${isMatch}`
          );
        }

        return isMatch;
      };

      const readNew = async (initial = false) => {
        try {
          const st = await fsp.stat(telemetryPath);
          const start = initial ? 0 : lastSize;
          if (st.size <= start) {
            lastSize = st.size;
            return;
          }
          const end = st.size - 1;
          const bytesToRead = end - start + 1;
          log(
            `Reading ${bytesToRead} bytes from ${start} to ${end} (${initial ? "initial" : "incremental"})`
          );

          await new Promise<void>((r) => {
            const rs = createReadStream(telemetryPath, {
              start,
              end,
              encoding: "utf-8",
            });
            rs.on("data", (chunk: string | Buffer) => {
              const text =
                typeof chunk === "string" ? chunk : chunk.toString("utf-8");
              feed(text, (obj) => {
                eventsProcessed++;
                try {
                  if (!stopped && isCompletionEvent(obj)) {
                    log(
                      `✓ Completion event detected! (processed ${eventsProcessed} events total)`
                    );
                    cleanup();
                    resolve();
                  }
                } catch (e) {
                  log("Error checking completion event:", e);
                }
              });
            });
            rs.on("end", () => r());
            rs.on("error", (err) => {
              log("ReadStream error:", err);
              r();
            });
          });
          lastSize = st.size;
          log(`File size updated to ${lastSize} bytes`);
        } catch (err) {
          // File doesn't exist yet - this is expected initially
          log("Could not read file (may not exist yet):", err);
        }
      };

      const attachFileWatcher = async () => {
        try {
          const st = await fsp.stat(telemetryPath);
          log(`Telemetry file exists! Size: ${st.size} bytes`);
          lastSize = st.size;
          await readNew(true);

          if (!stopped) {
            log("Attaching file watcher for changes");
            fileWatcher = watch(
              telemetryPath,
              { persistent: false, encoding: "utf8" },
              (eventType: string) => {
                log(`File watcher event: ${eventType}`);
                if (!stopped && eventType === "change") {
                  void readNew(false);
                }
              }
            );
          }
        } catch (err) {
          log("File not created yet:", err);
        }
      };

      log("Setting up directory watcher");
      dirWatcher = watch(
        dir,
        { persistent: false, encoding: "utf8" },
        (_eventType: string, filename: string | null) => {
          const name = filename;
          log(`Directory watcher event: ${_eventType}, filename: ${name}`);
          if (!stopped && name === file) {
            log("Telemetry file detected by directory watcher!");
            void attachFileWatcher();
          }
        }
      );

      // Initial check if file already exists
      void attachFileWatcher();

      // Set up polling as fallback in case watchers don't fire
      // This is important for reliability across different filesystems
      pollInterval = setInterval(() => {
        if (!stopped) {
          log("Polling for file changes");
          void attachFileWatcher();
        }
      }, POLL_INTERVAL_MS);

      log("Completion detector setup complete");
    })();
  });
}
