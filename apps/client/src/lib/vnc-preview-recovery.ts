/**
 * Pure state machine for VNC browser preview recovery.
 *
 * Problem: noVNC's HTML loads (iframe onLoad) while RFB never becomes ready,
 * so PersistentIframe marks "loaded" and shows a black canvas forever.
 *
 * This reducer drives: wait for RFB → auto-remount → surface error with manual retry.
 *
 * Debug: set ON_TRACE=1 (shell env for make dev-electron) or localStorage ON_TRACE=1
 * to log every recovery transition with a stack trace.
 */

/** True when ON_TRACE=1 is set in the shell (injected by electron-vite) or localStorage. */
export function isOnTraceEnabled(): boolean {
  try {
    // Injected at dev/build time from process.env.ON_TRACE (electron.vite.config.ts define)
    const env = (import.meta as ImportMeta & { env?: { ON_TRACE?: string } })
      .env;
    if (env?.ON_TRACE === "1") return true;
  } catch {
    // ignore
  }
  try {
    if (typeof process !== "undefined" && process.env?.ON_TRACE === "1") {
      return true;
    }
  } catch {
    // ignore
  }
  try {
    if (
      typeof window !== "undefined" &&
      window.localStorage?.getItem("ON_TRACE") === "1"
    ) {
      return true;
    }
  } catch {
    // ignore
  }
  return false;
}

export function onTrace(
  label: string,
  detail?: Record<string, unknown>
): void {
  if (!isOnTraceEnabled()) return;
  const payload = detail ? { ...detail } : undefined;
  // eslint-disable-next-line no-console
  console.log(`[ON_TRACE][vnc-preview-recovery] ${label}`, payload ?? "");
  // eslint-disable-next-line no-console
  console.trace(`[ON_TRACE][vnc-preview-recovery] ${label} stack`);
}

export type VncRfbPhase =
  | "idle"
  | "waiting"
  | "ready"
  | "remounting"
  | "failed";

export type VncRfbEvent =
  | { type: "START" }
  | { type: "IFRAME_LOADED" }
  | { type: "RFB_READY" }
  | { type: "WAIT_TIMEOUT" }
  | { type: "REMOUNT_STARTED" }
  | { type: "MANUAL_RETRY" }
  | { type: "DISABLE" };

export interface VncRfbRecoveryState {
  phase: VncRfbPhase;
  /** Number of automatic remounts already performed in this recovery cycle. */
  autoRemountCount: number;
  /**
   * Monotonic generation bumped on every remount (auto or manual).
   * Consumers can use this as a React key suffix or reload signal.
   */
  remountGeneration: number;
  errorMessage: string | null;
  /** True after the iframe reported onLoad at least once while waiting. */
  iframeLoaded: boolean;
}

export interface VncRfbRecoveryOptions {
  maxAutoRemounts?: number;
}

export const DEFAULT_RFB_WAIT_MS = 12_000;
export const DEFAULT_MAX_AUTO_REMOUNTS = 2;

export const RFB_TIMEOUT_ERROR_MESSAGE =
  "Remote desktop page loaded but the VNC session never became ready.";

export const VNC_RFB_READY_MESSAGE_TYPE = "vnc-rfb-ready" as const;
export const VNC_RFB_TIMEOUT_MESSAGE_TYPE = "vnc-rfb-timeout" as const;

export type VncRfbStatusMessage =
  | { type: typeof VNC_RFB_READY_MESSAGE_TYPE }
  | { type: typeof VNC_RFB_TIMEOUT_MESSAGE_TYPE; retries?: number };

export function createInitialVncRfbState(): VncRfbRecoveryState {
  return {
    phase: "idle",
    autoRemountCount: 0,
    remountGeneration: 0,
    errorMessage: null,
    iframeLoaded: false,
  };
}

export function reduceVncRfbRecovery(
  state: VncRfbRecoveryState,
  event: VncRfbEvent,
  options: VncRfbRecoveryOptions = {}
): VncRfbRecoveryState {
  const maxAutoRemounts = options.maxAutoRemounts ?? DEFAULT_MAX_AUTO_REMOUNTS;
  const next = reduceVncRfbRecoveryInner(state, event, maxAutoRemounts);
  if (next !== state && isOnTraceEnabled()) {
    onTrace("reduce", {
      event: event.type,
      from: state.phase,
      to: next.phase,
      autoRemountCount: next.autoRemountCount,
      remountGeneration: next.remountGeneration,
      iframeLoaded: next.iframeLoaded,
    });
  }
  return next;
}

function reduceVncRfbRecoveryInner(
  state: VncRfbRecoveryState,
  event: VncRfbEvent,
  maxAutoRemounts: number
): VncRfbRecoveryState {
  switch (event.type) {
    case "DISABLE":
      return createInitialVncRfbState();

    case "START":
      return {
        ...createInitialVncRfbState(),
        phase: "waiting",
      };

    case "MANUAL_RETRY":
      return {
        phase: "remounting",
        autoRemountCount: 0,
        remountGeneration: state.remountGeneration + 1,
        errorMessage: null,
        iframeLoaded: false,
      };

    case "IFRAME_LOADED":
      if (state.phase === "idle" || state.phase === "ready" || state.phase === "failed") {
        return state;
      }
      // Remount completed HTML load → back to waiting for RFB
      if (state.phase === "remounting") {
        return {
          ...state,
          phase: "waiting",
          iframeLoaded: true,
        };
      }
      return {
        ...state,
        iframeLoaded: true,
      };

    case "RFB_READY":
      if (state.phase === "idle" || state.phase === "failed") {
        // Still accept ready after failed so a late RFB clears the error
        if (state.phase === "failed") {
          return {
            ...state,
            phase: "ready",
            errorMessage: null,
            iframeLoaded: true,
          };
        }
        return state;
      }
      return {
        ...state,
        phase: "ready",
        errorMessage: null,
        iframeLoaded: true,
      };

    case "WAIT_TIMEOUT": {
      // Only the "waiting" phase (after HTML load, before RFB) may time out.
      // Ignore timeouts while remounting so bridge + parent timers cannot double-count.
      if (state.phase !== "waiting") {
        return state;
      }
      if (!state.iframeLoaded) {
        return state;
      }
      if (state.autoRemountCount < maxAutoRemounts) {
        return {
          ...state,
          phase: "remounting",
          autoRemountCount: state.autoRemountCount + 1,
          remountGeneration: state.remountGeneration + 1,
          errorMessage: null,
          iframeLoaded: false,
        };
      }
      return {
        ...state,
        phase: "failed",
        errorMessage: RFB_TIMEOUT_ERROR_MESSAGE,
      };
    }

    case "REMOUNT_STARTED":
      if (state.phase !== "remounting") {
        return state;
      }
      return state;

    default: {
      const _exhaustive: never = event;
      return _exhaustive;
    }
  }
}

/**
 * Overlay status forced onto PersistentWebView while RFB recovery is active.
 * null = let the iframe's natural status drive the UI.
 */
export function forcedIframeStatusForRecovery(
  state: VncRfbRecoveryState
): "loading" | "error" | null {
  switch (state.phase) {
    case "waiting":
    case "remounting":
      // Keep shell loader until RFB is ready (not just HTML load)
      return "loading";
    case "failed":
      return "error";
    case "ready":
    case "idle":
      return null;
    default: {
      const _exhaustive: never = state.phase;
      return _exhaustive;
    }
  }
}

export function isVncPreviewUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return url.includes("/vnc.html");
}

export function parseVncRfbStatusMessage(
  data: unknown
): VncRfbStatusMessage | null {
  if (typeof data !== "object" || data === null) {
    return null;
  }
  const type = (data as { type?: unknown }).type;
  if (type === VNC_RFB_READY_MESSAGE_TYPE) {
    return { type: VNC_RFB_READY_MESSAGE_TYPE };
  }
  if (type === VNC_RFB_TIMEOUT_MESSAGE_TYPE) {
    const retries = (data as { retries?: unknown }).retries;
    return {
      type: VNC_RFB_TIMEOUT_MESSAGE_TYPE,
      retries: typeof retries === "number" ? retries : undefined,
    };
  }
  return null;
}
