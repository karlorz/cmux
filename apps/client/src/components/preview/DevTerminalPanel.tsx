import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { createTerminalOptions } from "@cmux/shared/terminal-config";
import { env } from "@/client-env";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CircleAlert, Loader2, RefreshCw } from "lucide-react";

import { FitAddon } from "@xterm/addon-fit";
import { AttachAddon } from "@xterm/addon-attach";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

type DevTerminalStatus =
  | "idle"
  | "creating"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

const DEFAULT_XTERM_ORIGIN = "http://localhost:39383";

interface DevTerminalPanelProps {
  className?: string;
  tmuxSessionName?: string;
  tmuxWindowName?: string;
}

interface NormalizedDimensions {
  cols: number;
  rows: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(value, maximum));
}

export function DevTerminalPanel({
  className,
  tmuxSessionName = "cmux",
  tmuxWindowName = "dev",
}: DevTerminalPanelProps) {
  const xtermOrigin = useMemo(() => {
    return env.NEXT_PUBLIC_XTERM_ORIGIN ?? DEFAULT_XTERM_ORIGIN;
  }, []);

  const [status, setStatus] = useState<DevTerminalStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const wsPathRef = useRef<string | null>(null);
  const mountedRef = useRef(false);

  const normalizeDimensions = useCallback((): NormalizedDimensions => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return { cols: 120, rows: 32 };
    }
    try {
      fitAddon.fit();
    } catch (fitError) {
      console.warn("[DevTerminalPanel] Failed to fit terminal", fitError);
    }
    return {
      cols: clamp(terminal.cols || 120, 20, 320),
      rows: clamp(terminal.rows || 32, 8, 120),
    };
  }, []);

  const sendResize = useCallback(() => {
    const socket = socketRef.current;
    const fitAddon = fitAddonRef.current;
    if (fitAddon) {
      try {
        fitAddon.fit();
      } catch (fitError) {
        console.warn("[DevTerminalPanel] Failed to fit terminal during resize", fitError);
      }
    }
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    const { cols, rows } = normalizeDimensions();
    try {
      socket.send(JSON.stringify({ type: "resize", cols, rows }));
    } catch (error) {
      console.warn("[DevTerminalPanel] Failed to send resize message", error);
    }
  }, [normalizeDimensions]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(
    (cleanupSession: boolean) => {
      clearReconnectTimer();

      attachAddonRef.current?.dispose();
      attachAddonRef.current = null;

      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close();
      }
      socketRef.current = null;

      if (!cleanupSession || !sessionIdRef.current) {
        return;
      }
      const id = sessionIdRef.current;
      sessionIdRef.current = null;
      wsPathRef.current = null;
      fetch(`${xtermOrigin}/api/tabs/${id}`, { method: "DELETE" }).catch((error) => {
        console.warn("[DevTerminalPanel] Failed to delete terminal session", error);
      });
    },
    [clearReconnectTimer, xtermOrigin],
  );

  const ensureSession = useCallback(async () => {
    if (sessionIdRef.current) {
      return true;
    }

    if (!mountedRef.current) {
      return false;
    }

    setStatus("creating");
    setErrorMessage(null);

    try {
      const { cols, rows } = normalizeDimensions();
      const response = await fetch(`${xtermOrigin}/api/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cmd: "tmux",
          args: [
            "attach-session",
            "-t",
            tmuxSessionName,
            ";",
            "select-window",
            "-t",
            tmuxWindowName,
          ],
          cols,
          rows,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed (${response.status})`);
      }

      const payload = (await response.json()) as { id: string; ws_url?: string };
      sessionIdRef.current = payload.id;
      wsPathRef.current = payload.ws_url ?? `/ws/${payload.id}`;
      return true;
    } catch (error) {
      console.error("[DevTerminalPanel] Failed to create terminal session", error);
      if (mountedRef.current) {
        setErrorMessage(
          error instanceof Error ? error.message : "Unable to start dev terminal",
        );
        setStatus("error");
      }
      return false;
    }
  }, [normalizeDimensions, tmuxSessionName, tmuxWindowName, xtermOrigin]);

  const connectSocket = useCallback(async () => {
    if (!mountedRef.current) {
      return;
    }
    const ready = await ensureSession();
    if (!ready || !sessionIdRef.current) {
      return;
    }

    const wsPath = wsPathRef.current ?? `/ws/${sessionIdRef.current}`;
    let wsUrl: URL;
    try {
      wsUrl = new URL(wsPath, xtermOrigin);
    } catch (error) {
      console.error("[DevTerminalPanel] Invalid WebSocket URL", error);
      setStatus("error");
      setErrorMessage("Invalid WebSocket URL");
      return;
    }
    if (wsUrl.protocol === "http:") {
      wsUrl.protocol = "ws:";
    } else if (wsUrl.protocol === "https:") {
      wsUrl.protocol = "wss:";
    }

    setStatus("connecting");
    setErrorMessage(null);

    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    const attach = new AttachAddon(socket, { bidirectional: false });
    attachAddonRef.current?.dispose();
    attachAddonRef.current = attach;
    terminalRef.current?.loadAddon(attach);

    socket.addEventListener("open", () => {
      if (!mountedRef.current) {
        return;
      }
      setStatus("connected");
      setErrorMessage(null);
      sendResize();
    });

    socket.addEventListener("close", () => {
      if (!mountedRef.current) {
        return;
      }
      attachAddonRef.current?.dispose();
      attachAddonRef.current = null;
      socketRef.current = null;
      if (!mountedRef.current) {
        return;
      }
      setStatus("disconnected");
      setErrorMessage("Connection lost. Retrying…");
      clearReconnectTimer();
      reconnectTimerRef.current = window.setTimeout(() => {
        reconnectTimerRef.current = null;
        if (mountedRef.current) {
          void connectSocket();
        }
      }, 2000);
    });

    socket.addEventListener("error", (event) => {
      console.error("[DevTerminalPanel] WebSocket error", event);
      if (!mountedRef.current) {
        return;
      }
      setStatus("error");
      setErrorMessage("WebSocket connection failed");
    });
  }, [clearReconnectTimer, ensureSession, sendResize, xtermOrigin]);

  const handleReconnect = useCallback(() => {
    if (!mountedRef.current) {
      return;
    }
    setErrorMessage(null);
    setStatus("connecting");
    disconnect(false);
    void connectSocket();
  }, [connectSocket, disconnect]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    mountedRef.current = true;

    const term = new Terminal(
      createTerminalOptions({
        allowProposedApi: true,
        convertEol: true,
        cursorBlink: true,
        scrollback: 200_000,
        fontFamily: '"JetBrains Mono", "Fira Code", monospace',
        fontSize: 13,
      }),
    );
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.loadAddon(searchAddon);
    term.loadAddon(unicodeAddon);
    unicodeAddon.activate(term);

    try {
      const webglAddon = new WebglAddon();
      term.loadAddon(webglAddon);
      webglAddon.onContextLoss(() => {
        webglAddon.dispose();
      });
    } catch (error) {
      console.warn("[DevTerminalPanel] Failed to enable WebGL rendering", error);
    }

    terminalRef.current = term;
    fitAddonRef.current = fitAddon;

    const container = containerRef.current;
    if (container) {
      term.open(container);
      try {
        fitAddon.fit();
      } catch (fitError) {
        console.warn("[DevTerminalPanel] Initial fit failed", fitError);
      }
    }

    const observer = new ResizeObserver(() => {
      sendResize();
    });
    if (container) {
      observer.observe(container);
    }
    resizeObserverRef.current = observer;
    window.addEventListener("resize", sendResize);

    setStatus("creating");
    void connectSocket();

    return () => {
      mountedRef.current = false;
      clearReconnectTimer();
      resizeObserverRef.current?.disconnect();
      resizeObserverRef.current = null;
      window.removeEventListener("resize", sendResize);
      disconnect(true);
      fitAddonRef.current = null;
      attachAddonRef.current?.dispose();
      attachAddonRef.current = null;
      const currentTerminal = terminalRef.current;
      terminalRef.current = null;
      currentTerminal?.dispose();
    };
  }, [clearReconnectTimer, connectSocket, disconnect, sendResize]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "creating":
        return "Starting terminal…";
      case "connecting":
        return "Connecting…";
      case "connected":
        return "Connected";
      case "disconnected":
        return "Disconnected";
      case "error":
        return "Error";
      default:
        return "Idle";
    }
  }, [status]);

  const shouldShowSpinner =
    status === "creating" || status === "connecting" || status === "disconnected";
  const shouldShowOverlay = shouldShowSpinner || status === "error";

  return (
    <div
      className={cn(
        "flex h-full min-w-[320px] max-w-full flex-col border-l border-neutral-200 bg-neutral-950/95 dark:border-neutral-800 dark:bg-neutral-950",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-200/70 px-3 py-2 dark:border-neutral-800/80">
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
            Dev Terminal
          </span>
          <span className="text-xs text-neutral-500 dark:text-neutral-500">{statusLabel}</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-7 text-neutral-500 hover:text-neutral-300 dark:text-neutral-400 dark:hover:text-neutral-200"
          onClick={handleReconnect}
          title="Reconnect"
          aria-label="Reconnect to terminal"
          disabled={shouldShowSpinner}
        >
          {shouldShowSpinner ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div ref={containerRef} className="absolute inset-0" />
        {shouldShowOverlay && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-neutral-950/80 px-6 text-center text-neutral-200">
            <LoaderOrIcon status={status} />
            {errorMessage ? (
              <p className="text-xs text-neutral-300 dark:text-neutral-200">{errorMessage}</p>
            ) : (
              <p className="text-xs text-neutral-300 dark:text-neutral-200">{statusLabel}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LoaderOrIcon({ status }: { status: DevTerminalStatus }) {
  if (status === "error") {
    return <CircleAlert className="size-5 text-red-400" />;
  }
  return <Loader2 className="size-5 animate-spin text-neutral-200" />;
}
