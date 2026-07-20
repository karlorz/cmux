import { useCallback, useEffect, useReducer, useRef } from "react";

import { persistentIframeManager } from "@/lib/persistentIframeManager";
import {
  createInitialVncRfbState,
  DEFAULT_MAX_AUTO_REMOUNTS,
  DEFAULT_RFB_WAIT_MS,
  forcedIframeStatusForRecovery,
  isVncPreviewUrl,
  onTrace,
  parseVncRfbStatusMessage,
  reduceVncRfbRecovery,
  type VncRfbEvent,
  type VncRfbRecoveryState,
  VNC_RFB_READY_MESSAGE_TYPE,
  VNC_RFB_TIMEOUT_MESSAGE_TYPE,
} from "@/lib/vnc-preview-recovery";

export interface UseVncPreviewRecoveryOptions {
  /** Persistent iframe key used by persistentIframeManager */
  persistKey: string;
  /** Resolved browser preview URL (noVNC or other) */
  browserUrl: string | null | undefined;
  /** Parent-side RFB wait after iframe load (default 12s) */
  waitMs?: number;
  /** Automatic remount budget before error UI (default 2) */
  maxAutoRemounts?: number;
}

export interface UseVncPreviewRecoveryResult {
  recovery: VncRfbRecoveryState;
  /** Force PersistentWebView status so HTML-load does not hide the loader */
  forcedStatus: "loading" | "error" | null;
  /** Call from iframe onLoad */
  onIframeLoad: () => void;
  /** Manual retry from error UI */
  retry: () => void;
  /** True while RFB recovery is active for a VNC URL */
  enabled: boolean;
  /** True when recovery says the browser surface is not yet usable */
  isBusy: boolean;
}

function recoveryReducer(
  state: VncRfbRecoveryState,
  action: { event: VncRfbEvent; maxAutoRemounts: number }
): VncRfbRecoveryState {
  return reduceVncRfbRecovery(state, action.event, {
    maxAutoRemounts: action.maxAutoRemounts,
  });
}

/**
 * Keeps browser preview from going black when noVNC HTML loads but RFB never
 * becomes ready. Listens for sandbox bridge postMessages (when present) and
 * always arms a parent-side timer after iframe load so older sandboxes recover
 * via remount + error UI as well.
 */
export function useVncPreviewRecovery({
  persistKey,
  browserUrl,
  waitMs = DEFAULT_RFB_WAIT_MS,
  maxAutoRemounts = DEFAULT_MAX_AUTO_REMOUNTS,
}: UseVncPreviewRecoveryOptions): UseVncPreviewRecoveryResult {
  const enabled = isVncPreviewUrl(browserUrl);
  const [recovery, dispatchRaw] = useReducer(
    recoveryReducer,
    undefined,
    createInitialVncRfbState
  );
  const recoveryRef = useRef(recovery);
  recoveryRef.current = recovery;

  const waitTimerRef = useRef<number | null>(null);
  const maxAutoRemountsRef = useRef(maxAutoRemounts);
  maxAutoRemountsRef.current = maxAutoRemounts;
  const waitMsRef = useRef(waitMs);
  waitMsRef.current = waitMs;
  const lastRemountGenRef = useRef(0);

  const dispatch = useCallback((event: VncRfbEvent) => {
    onTrace("dispatch", {
      event: event.type,
      persistKey,
      phase: recoveryRef.current.phase,
    });
    dispatchRaw({ event, maxAutoRemounts: maxAutoRemountsRef.current });
  }, [persistKey]);

  const clearWaitTimer = useCallback(() => {
    if (waitTimerRef.current !== null) {
      window.clearTimeout(waitTimerRef.current);
      waitTimerRef.current = null;
    }
  }, []);

  const armWaitTimer = useCallback(() => {
    clearWaitTimer();
    waitTimerRef.current = window.setTimeout(() => {
      waitTimerRef.current = null;
      if (recoveryRef.current.phase === "waiting") {
        console.warn(
          `[VncPreviewRecovery] RFB wait timed out after ${waitMsRef.current}ms for ${persistKey}`
        );
        dispatch({ type: "WAIT_TIMEOUT" });
      }
    }, waitMsRef.current);
  }, [clearWaitTimer, dispatch, persistKey]);

  // Enable / disable when URL changes
  useEffect(() => {
    if (!enabled) {
      clearWaitTimer();
      dispatch({ type: "DISABLE" });
      return;
    }
    dispatch({ type: "START" });
    return () => {
      clearWaitTimer();
    };
  }, [clearWaitTimer, dispatch, enabled, persistKey, browserUrl]);

  // Reload iframe whenever remountGeneration advances
  useEffect(() => {
    if (!enabled) {
      lastRemountGenRef.current = recovery.remountGeneration;
      return;
    }
    if (recovery.remountGeneration === lastRemountGenRef.current) {
      return;
    }
    lastRemountGenRef.current = recovery.remountGeneration;
    if (recovery.remountGeneration === 0) {
      return;
    }

    console.info(
      `[VncPreviewRecovery] Remounting VNC preview (gen=${recovery.remountGeneration}, auto=${recovery.autoRemountCount}) key=${persistKey}`
    );
    const reloaded = persistentIframeManager.reloadIframe(persistKey);
    if (!reloaded) {
      // Iframe may not be registered yet; retry once on next frame
      requestAnimationFrame(() => {
        persistentIframeManager.reloadIframe(persistKey);
      });
    }
    dispatch({ type: "REMOUNT_STARTED" });
  }, [
    dispatch,
    enabled,
    persistKey,
    recovery.autoRemountCount,
    recovery.remountGeneration,
  ]);

  // postMessage from sandbox clipboard bridge (new images) + safety
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onMessage = (event: MessageEvent) => {
      const iframe = persistentIframeManager.getIframeElement(persistKey);
      if (!iframe?.contentWindow) {
        return;
      }
      if (event.source !== iframe.contentWindow) {
        return;
      }

      const parsed = parseVncRfbStatusMessage(event.data);
      if (!parsed) {
        return;
      }

      if (parsed.type === VNC_RFB_READY_MESSAGE_TYPE) {
        clearWaitTimer();
        console.info(`[VncPreviewRecovery] RFB ready for ${persistKey}`);
        dispatch({ type: "RFB_READY" });
        return;
      }

      if (parsed.type === VNC_RFB_TIMEOUT_MESSAGE_TYPE) {
        console.warn(
          `[VncPreviewRecovery] Bridge reported RFB timeout for ${persistKey}`,
          parsed.retries
        );
        // Parent timer is authoritative for remount budget; still treat as timeout signal
        dispatch({ type: "WAIT_TIMEOUT" });
      }
    };

    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
    };
  }, [clearWaitTimer, dispatch, enabled, persistKey]);

  const onIframeLoad = useCallback(() => {
    if (!enabled) {
      return;
    }
    dispatch({ type: "IFRAME_LOADED" });
    // HTML loaded ≠ RFB ready; keep waiting
    if (recoveryRef.current.phase !== "ready") {
      armWaitTimer();
    }
  }, [armWaitTimer, dispatch, enabled]);

  const retry = useCallback(() => {
    if (!enabled) {
      return;
    }
    clearWaitTimer();
    dispatch({ type: "MANUAL_RETRY" });
  }, [clearWaitTimer, dispatch, enabled]);

  const forcedStatus = enabled
    ? forcedIframeStatusForRecovery(recovery)
    : null;

  return {
    recovery,
    forcedStatus,
    onIframeLoad,
    retry,
    enabled,
    // idle/waiting/remounting/failed all mean the remote desktop is not usable yet
    isBusy: enabled && recovery.phase !== "ready",
  };
}
