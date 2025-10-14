import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

import { usePersistentIframe } from "../hooks/usePersistentIframe";
import { useMorphInstanceResume } from "../hooks/useMorphInstanceResume";
import { extractMorphInstanceId, isMorphUrl } from "../lib/toProxyWorkspaceUrl";
import { cn } from "@/lib/utils";

export type PersistentIframeStatus = "loading" | "loaded" | "error";

interface PersistentIframeProps {
  persistKey: string;
  src: string;
  className?: string;
  style?: CSSProperties;
  preload?: boolean;
  allow?: string;
  sandbox?: string;
  iframeClassName?: string;
  iframeStyle?: CSSProperties;
  onLoad?: () => void;
  onError?: (error: Error) => void;
  loadingFallback?: ReactNode;
  loadingClassName?: string;
  errorFallback?: ReactNode;
  errorClassName?: string;
  onStatusChange?: (status: PersistentIframeStatus) => void;
  forcedStatus?: PersistentIframeStatus | null;
  loadTimeoutMs?: number;
  preflight?: boolean;
}

type ScrollTarget = HTMLElement | Window;

interface IframePreflightResult {
  ok: boolean;
  status: number | null;
  method: "HEAD" | "GET" | null;
  error?: string;
}

function parseIframePreflightResult(
  raw: unknown,
): IframePreflightResult | null {
  if (typeof raw !== "object" || raw === null) {
    return null;
  }

  const record = raw as Record<string, unknown>;
  const { ok, status, method, error } = record;

  if (typeof ok !== "boolean") {
    return null;
  }

  let normalizedStatus: number | null;
  if (status === null) {
    normalizedStatus = null;
  } else if (typeof status === "number" && Number.isInteger(status) && status >= 0) {
    normalizedStatus = status;
  } else {
    return null;
  }

  let normalizedMethod: "HEAD" | "GET" | null;
  if (method === null) {
    normalizedMethod = null;
  } else if (method === "HEAD" || method === "GET") {
    normalizedMethod = method;
  } else {
    return null;
  }

  if (error !== undefined && typeof error !== "string") {
    return null;
  }

  return {
    ok,
    status: normalizedStatus,
    method: normalizedMethod,
    error,
  };
}

function getScrollableParents(element: HTMLElement): ScrollTarget[] {
  const parents: ScrollTarget[] = [];
  let current: HTMLElement | null = element.parentElement;

  while (current) {
    const style = window.getComputedStyle(current);
    if (
      style.overflow === "auto" ||
      style.overflow === "scroll" ||
      style.overflowX === "auto" ||
      style.overflowX === "scroll" ||
      style.overflowY === "auto" ||
      style.overflowY === "scroll"
    ) {
      parents.push(current);
    }
    current = current.parentElement;
  }

  parents.push(window);

  return parents;
}

export function PersistentIframe({
  persistKey,
  src,
  className,
  style,
  preload,
  allow,
  sandbox,
  iframeClassName,
  iframeStyle,
  onLoad,
  onError,
  loadingFallback,
  loadingClassName,
  errorFallback,
  errorClassName,
  onStatusChange,
  forcedStatus,
  loadTimeoutMs = 30_000,
  preflight = true,
}: PersistentIframeProps) {
  const [status, setStatus] = useState<PersistentIframeStatus>("loading");
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const [, forceRender] = useState(0);
  const loadTimeoutRef = useRef<number | null>(null);
  const preflightAbortRef = useRef<AbortController | null>(null);

  // Check if this is a morph URL
  const isMorph = src ? isMorphUrl(src) : false;
  const morphInstanceId = src ? extractMorphInstanceId(src) : null;

  // Use resume hook for morph URLs
  const morphResumeState = useMorphInstanceResume({
    instanceId: isMorph ? morphInstanceId : null,
  });

  useEffect(() => {
    setStatus("loading");
  }, [persistKey, src]);

  const clearLoadTimeout = useCallback(() => {
    if (loadTimeoutRef.current !== null) {
      window.clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = null;
    }
  }, []);

  const handleLoad = useCallback(() => {
    clearLoadTimeout();
    setStatus("loaded");
    onLoad?.();
  }, [clearLoadTimeout, onLoad]);

  const handleError = useCallback(
    (error: Error) => {
      clearLoadTimeout();
      setStatus("error");
      onError?.(error);
    },
    [clearLoadTimeout, onError],
  );

  useEffect(() => {
    if (forcedStatus && forcedStatus !== "loading") {
      clearLoadTimeout();
      return;
    }

    if (status !== "loading") {
      clearLoadTimeout();
      return;
    }

    if (!loadTimeoutMs || loadTimeoutMs <= 0) {
      clearLoadTimeout();
      return;
    }

    loadTimeoutRef.current = window.setTimeout(() => {
      handleError(
        new Error(
          `Timed out loading iframe "${persistKey}" after ${loadTimeoutMs}ms`,
        ),
      );
    }, loadTimeoutMs);

    return () => {
      clearLoadTimeout();
    };
  }, [
    clearLoadTimeout,
    forcedStatus,
    handleError,
    loadTimeoutMs,
    persistKey,
    status,
  ]);

  const { containerRef } = usePersistentIframe({
    key: persistKey,
    url: src,
    preload,
    allow,
    sandbox,
    className: iframeClassName,
    style: iframeStyle,
    onLoad: handleLoad,
    onError: handleError,
  });

  const effectiveStatus = forcedStatus ?? status;

  // For morph URLs, override status based on resume state
  const finalStatus = isMorph
    ? (morphResumeState.status === "ready" ? effectiveStatus :
       morphResumeState.status === "not_found" || morphResumeState.status === "failed" ? "error" :
       "loading")
    : effectiveStatus;

  useEffect(() => {
    onStatusChange?.(finalStatus);
  }, [finalStatus, onStatusChange]);

  useEffect(() => {
    if (!preflight) {
      return;
    }
    if (!src) {
      return;
    }
    if (typeof window === "undefined" || typeof fetch === "undefined") {
      return;
    }

    // For morph URLs, handle resume logic instead of preflight
    if (isMorph) {
      if (morphResumeState.status === "not_found") {
        handleError(new Error("Morph instance not found"));
      } else if (morphResumeState.status === "failed") {
        handleError(new Error(`Failed to resume morph instance: ${morphResumeState.message || "Unknown error"}`));
      }
      // For "ready" status, we don't need to do anything - the iframe will load normally
      // For "resuming" and "loading", the iframe loading is blocked by the status check below
      return;
    }

    preflightAbortRef.current?.abort();
    const controller = new AbortController();
    preflightAbortRef.current = controller;

    const runPreflight = async () => {
      try {
        const searchParams = new URLSearchParams({ url: src });
        const response = await fetch(
          `/api/iframe/preflight?${searchParams.toString()}`,
          {
            method: "GET",
            cache: "no-store",
            credentials: "include",
            signal: controller.signal,
          },
        );

        if (controller.signal.aborted) {
          return;
        }

        if (!response.ok) {
          handleError(
            new Error(
              `Preflight request failed (status ${response.status}) for iframe "${persistKey}"`,
            ),
          );
          return;
        }

        const payload = parseIframePreflightResult(await response.json());

        if (controller.signal.aborted) {
          return;
        }

        if (!payload) {
          handleError(
            new Error(
              `Preflight returned an unexpected response for iframe "${persistKey}"`,
            ),
          );
          return;
        }

        if (!payload.ok) {
          const statusText =
            payload.status !== null ? `status ${payload.status}` : "an error";
          handleError(
            new Error(
              payload.error ??
                `Preflight failed (${statusText}) for iframe "${persistKey}"`,
            ),
          );
        }
      } catch (error) {
        if (controller.signal.aborted) {
          return;
        }
        handleError(
          error instanceof Error
            ? error
            : new Error(`Preflight failed for iframe "${persistKey}"`),
        );
      }
    };

    void runPreflight();

    return () => {
      controller.abort();
      if (preflightAbortRef.current === controller) {
        preflightAbortRef.current = null;
      }
    };
  }, [handleError, persistKey, preflight, src, isMorph, morphResumeState.status, morphResumeState.message]);

  const showLoadingOverlay = finalStatus === "loading" && loadingFallback;
  const showErrorOverlay = finalStatus === "error" && errorFallback;
  const shouldShowOverlay = Boolean(showLoadingOverlay || showErrorOverlay);

  const syncOverlayPosition = useCallback(() => {
    const overlay = overlayRef.current;
    const target = containerRef.current;
    if (!overlay || !target) return;

    const rect = target.getBoundingClientRect();
    const computedStyle = window.getComputedStyle(target);

    const borderLeft = parseFloat(computedStyle.borderLeftWidth) || 0;
    const borderRight = parseFloat(computedStyle.borderRightWidth) || 0;
    const borderTop = parseFloat(computedStyle.borderTopWidth) || 0;
    const borderBottom = parseFloat(computedStyle.borderBottomWidth) || 0;

    const width = Math.max(0, rect.width - borderLeft - borderRight);
    const height = Math.max(0, rect.height - borderTop - borderBottom);

    if (width < 1 || height < 1) {
      overlay.style.visibility = "hidden";
      return;
    }

    overlay.style.visibility = "visible";
    overlay.style.transform = `translate(${rect.left + borderLeft}px, ${rect.top + borderTop}px)`;
    overlay.style.width = `${width}px`;
    overlay.style.height = `${height}px`;
  }, [containerRef]);

  useEffect(() => {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return;
    }

    if (!shouldShowOverlay) {
      if (overlayRef.current) {
        overlayRef.current.style.display = "none";
      }
      return;
    }

    const target = containerRef.current;
    if (!target) {
      return;
    }

    let overlay = overlayRef.current;
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.dataset.persistentIframeOverlay = persistKey;
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.pointerEvents = "none";
      overlay.style.zIndex = "var(--z-global-blocking, 2147483647)";
      overlay.style.visibility = "hidden";
      overlayRef.current = overlay;
      document.body.appendChild(overlay);
      forceRender((value) => value + 1);
    }

    overlay.dataset.persistentIframeOverlay = persistKey;
    overlay.style.display = "block";

    syncOverlayPosition();

    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            syncOverlayPosition();
          })
        : null;
    resizeObserver?.observe(target);

    const scrollParents = getScrollableParents(target);
    const handleReposition = () => {
      syncOverlayPosition();
    };

    scrollParents.forEach((parent) =>
      parent.addEventListener("scroll", handleReposition, { passive: true }),
    );
    window.addEventListener("resize", handleReposition);

    return () => {
      resizeObserver?.disconnect();
      scrollParents.forEach((parent) =>
        parent.removeEventListener("scroll", handleReposition),
      );
      window.removeEventListener("resize", handleReposition);
      if (overlay) {
        overlay.style.display = "none";
      }
    };
  }, [containerRef, persistKey, shouldShowOverlay, syncOverlayPosition]);

  useEffect(() => {
    return () => {
      clearLoadTimeout();
      if (overlayRef.current) {
        overlayRef.current.remove();
        overlayRef.current = null;
      }
    };
  }, [clearLoadTimeout]);

  const overlayElement = overlayRef.current;
  const overlayContent = showErrorOverlay
    ? {
        node: errorFallback,
        className: cn(
          "pointer-events-none flex h-full w-full items-center justify-center bg-neutral-50/90 dark:bg-neutral-950/90",
          errorClassName,
        ),
      }
    : showLoadingOverlay
      ? {
          node: loadingFallback,
          className: cn(
            "pointer-events-none flex h-full w-full items-center justify-center bg-neutral-50 dark:bg-neutral-950",
            loadingClassName,
          ),
        }
      : null;

  return (
    <>
      <div
        ref={containerRef}
        className={cn("relative", className)}
        style={style}
      />
      {overlayElement && overlayContent && shouldShowOverlay
        ? createPortal(
            <div className={overlayContent.className}>
              <div className="pointer-events-auto">{overlayContent.node}</div>
            </div>,
            overlayElement,
          )
        : null}
    </>
  );
}
