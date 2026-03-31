import { useEffect, useRef, useCallback } from "react";
import { isElectron } from "@/lib/electron";

interface UseVisibilityAwareIntervalOptions {
  /** The callback to execute on each interval tick */
  callback: () => void;
  /** Interval in milliseconds */
  intervalMs: number;
  /** Whether to execute callback immediately on visibility restore (default: true) */
  executeOnRestore?: boolean;
  /** Whether to execute callback immediately on mount (default: false) */
  executeOnMount?: boolean;
  /** Whether polling is enabled (default: true) */
  enabled?: boolean;
}

/**
 * A visibility-aware interval hook that pauses polling when the tab/window is hidden.
 * For Electron apps, also pauses when the window loses focus.
 *
 * This reduces CPU usage when the app is idle in the background.
 */
export function useVisibilityAwareInterval({
  callback,
  intervalMs,
  executeOnRestore = true,
  executeOnMount = false,
  enabled = true,
}: UseVisibilityAwareIntervalOptions): void {
  const callbackRef = useRef(callback);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(
    typeof document !== "undefined"
      ? document.visibilityState === "visible"
      : true
  );

  // Keep callback ref fresh without triggering effect re-runs
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const startInterval = useCallback(() => {
    if (intervalIdRef.current !== null) return;
    intervalIdRef.current = setInterval(() => {
      callbackRef.current();
    }, intervalMs);
  }, [intervalMs]);

  const stopInterval = useCallback(() => {
    if (intervalIdRef.current !== null) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopInterval();
      return;
    }

    if (typeof document === "undefined") return;

    const handleVisibilityChange = () => {
      const nowVisible = document.visibilityState === "visible";
      const wasHidden = !isVisibleRef.current;
      isVisibleRef.current = nowVisible;

      if (nowVisible) {
        startInterval();
        // Execute immediately on restore if configured and was previously hidden
        if (wasHidden && executeOnRestore) {
          callbackRef.current();
        }
      } else {
        stopInterval();
      }
    };

    // For Electron: also pause on window blur
    const handleWindowBlur = () => {
      if (isElectron) {
        stopInterval();
      }
    };

    const handleWindowFocus = () => {
      if (isElectron && document.visibilityState === "visible") {
        startInterval();
        if (executeOnRestore) {
          callbackRef.current();
        }
      }
    };

    // Initial setup
    if (document.visibilityState === "visible") {
      startInterval();
      if (executeOnMount) {
        callbackRef.current();
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    if (isElectron) {
      window.addEventListener("blur", handleWindowBlur);
      window.addEventListener("focus", handleWindowFocus);
    }

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      if (isElectron) {
        window.removeEventListener("blur", handleWindowBlur);
        window.removeEventListener("focus", handleWindowFocus);
      }
    };
  }, [enabled, startInterval, stopInterval, executeOnRestore, executeOnMount]);
}
