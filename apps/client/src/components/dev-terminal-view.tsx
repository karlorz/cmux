import { createTerminalOptions } from "@cmux/shared/terminal-config";
import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RefreshCw, Terminal as TerminalIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { useXTerm } from "./xterm/use-xterm";

interface DevTerminalViewProps {
  baseUrl: string | null;
  className?: string;
  attachCommand?: string;
  title?: string;
}

type ConnectionStatus =
  | "idle"
  | "creating"
  | "connecting"
  | "connected"
  | "closed"
  | "error"
  | "unavailable";

const DEFAULT_ATTACH_COMMAND = [
  "if tmux has-session -t cmux 2>/dev/null; then",
  "  if tmux list-windows -t cmux -F '#W' | grep -qx dev; then",
  "    tmux attach-session -t cmux \\; select-window -t cmux:dev",
  "  else",
  "    tmux attach-session -t cmux",
  "  fi",
  "else",
  "  echo \"tmux session cmux not found. Starting shell...\"",
  "  exec zsh",
  "fi",
].join("; ");

interface SessionState {
  id: string;
  socket: WebSocket | null;
  attachAddon: AttachAddon | null;
}

export function DevTerminalView({
  baseUrl,
  className,
  attachCommand,
  title = "Dev Script Terminal",
}: DevTerminalViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<SessionState | null>(null);
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const fitAddon = useMemo(() => new FitAddon(), []);
  const webLinksAddon = useMemo(() => new WebLinksAddon(), []);

  const normalizedCommand = useMemo(() => {
    const script = attachCommand?.trim();
    return script && script.length > 0 ? script : DEFAULT_ATTACH_COMMAND;
  }, [attachCommand]);

  const { ref: terminalRef, instance: terminal } = useXTerm({
    addons: [fitAddon, webLinksAddon],
    options: createTerminalOptions({
      convertEol: true,
      scrollback: 100_000,
      fontSize: 13,
      theme: {
        background: "#0f172a",
        foreground: "#e2e8f0",
        cursor: "#38bdf8",
      },
    }),
  });

  useEffect(() => {
    if (!terminal) {
      return;
    }

    const unicodeAddon = new Unicode11Addon();
    const searchAddon = new SearchAddon();
    let webglAddon: WebglAddon | null = null;

    terminal.loadAddon(unicodeAddon);
    unicodeAddon.activate(terminal);
    terminal.loadAddon(searchAddon);

    try {
      webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    return () => {
      unicodeAddon.dispose();
      searchAddon.dispose();
      webglAddon?.dispose();
    };
  }, [terminal]);

  const pushResize = useCallback(
    (cols: number, rows: number) => {
      if (!Number.isFinite(cols) || !Number.isFinite(rows)) {
        return;
      }
      pendingResizeRef.current = { cols, rows };
      const session = sessionRef.current;
      if (!session?.socket || session.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      try {
        session.socket.send(
          JSON.stringify({
            type: "resize",
            cols,
            rows,
          }),
        );
        pendingResizeRef.current = null;
      } catch {
        // Preserve pending resize so it can be retried when connection stabilizes.
      }
    },
    [],
  );

  useEffect(() => {
    if (!terminal || !containerRef.current) {
      return;
    }

    const handleResize = () => {
      fitAddon.fit();
      pushResize(terminal.cols, terminal.rows);
    };

    // Perform initial fit
    handleResize();

    const resizeObserver = new ResizeObserver(() => {
      handleResize();
    });

    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", handleResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [fitAddon, pushResize, terminal]);

  useEffect(() => {
    if (!terminal) {
      return;
    }

    if (!baseUrl) {
      setStatus("unavailable");
      setErrorMessage(null);
      return;
    }

    setStatus("creating");
    setErrorMessage(null);

    const controller = new AbortController();
    let disposed = false;
    let currentSocket: WebSocket | null = null;
    let currentAttachAddon: AttachAddon | null = null;
    let sessionId: string | null = null;

    const cleanupSession = () => {
      if (currentAttachAddon) {
        try {
          currentAttachAddon.dispose();
        } catch {
          // noop
        }
        currentAttachAddon = null;
      }
      if (currentSocket) {
        try {
          currentSocket.close();
        } catch {
          // noop
        }
        currentSocket = null;
      }
      sessionRef.current = null;
    };

    const ensureUrl = (path: string) => new URL(path, baseUrl).toString();

    const establishSession = async () => {
      try {
        // Ensure terminal dimensions are up-to-date before requesting session.
        fitAddon.fit();
        const initialCols = Number.isFinite(terminal.cols) ? terminal.cols : 80;
        const initialRows = Number.isFinite(terminal.rows) ? terminal.rows : 24;

        const response = await fetch(ensureUrl("api/tabs"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cmd: "/bin/zsh",
            args: ["-lc", normalizedCommand],
            cols: initialCols,
            rows: initialRows,
          }),
          signal: controller.signal,
          credentials: "omit",
        });

        if (!response.ok) {
          throw new Error(`Failed to create terminal session (${response.status})`);
        }

        const payload: { id: string; ws_url: string } = await response.json();
        if (disposed) {
          return;
        }

        sessionId = payload.id;
        const wsUrl = new URL(payload.ws_url, baseUrl);
        if (wsUrl.protocol === "http:") {
          wsUrl.protocol = "ws:";
        } else if (wsUrl.protocol === "https:") {
          wsUrl.protocol = "wss:";
        }

        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        currentSocket = socket;
        currentAttachAddon = new AttachAddon(socket, { bidirectional: true });

        sessionRef.current = {
          id: sessionId,
          socket,
          attachAddon: currentAttachAddon,
        };

        setStatus("connecting");

        const handleOpen = () => {
          if (disposed) {
            return;
          }
          setStatus("connected");
          if (pendingResizeRef.current) {
            pushResize(
              pendingResizeRef.current.cols,
              pendingResizeRef.current.rows,
            );
          } else {
            pushResize(terminal.cols, terminal.rows);
          }
          terminal.focus();
        };

        const handleClose = () => {
          if (disposed) {
            return;
          }
          setStatus("closed");
        };

        const handleError = () => {
          if (disposed) {
            return;
          }
          setStatus("error");
          setErrorMessage("Terminal connection error");
        };

        socket.addEventListener("open", handleOpen);
        socket.addEventListener("close", handleClose);
        socket.addEventListener("error", handleError);

        terminal.loadAddon(currentAttachAddon);
      } catch (error) {
        if (disposed) {
          return;
        }
        if ((error as Error).name === "AbortError") {
          return;
        }
        setStatus("error");
        setErrorMessage(error instanceof Error ? error.message : String(error));
        cleanupSession();
      }
    };

    void establishSession();

    return () => {
      disposed = true;
      controller.abort();
      cleanupSession();

      if (sessionId) {
        const deleteUrl = ensureUrl(`api/tabs/${sessionId}`);
        void fetch(deleteUrl, {
          method: "DELETE",
          credentials: "omit",
        }).catch(() => {
          /* ignore */
        });
      }
    };
  }, [baseUrl, fitAddon, normalizedCommand, pushResize, retryCount, terminal]);

  useEffect(() => {
    if (status === "connected") {
      return;
    }
    if (!baseUrl && status !== "unavailable") {
      setStatus("unavailable");
    }
  }, [baseUrl, status]);

  const statusLabel = (() => {
    switch (status) {
      case "creating":
        return "Starting";
      case "connecting":
        return "Connecting";
      case "connected":
        return "Connected";
      case "closed":
        return "Closed";
      case "error":
        return "Error";
      case "unavailable":
        return "Unavailable";
      default:
        return "Idle";
    }
  })();

  const statusIndicatorClass = (() => {
    switch (status) {
      case "connected":
        return "bg-emerald-400";
      case "connecting":
      case "creating":
        return "bg-amber-400";
      case "closed":
        return "bg-neutral-400";
      case "error":
      case "unavailable":
        return "bg-rose-500";
      default:
        return "bg-neutral-500";
    }
  })();

  const showSpinner = status === "creating" || status === "connecting";
  const showRetryButton = status === "error" || status === "closed";

  const handleRetry = () => {
    setRetryCount((value) => value + 1);
  };

  return (
    <div
      className={cn(
        "flex h-full min-h-[320px] flex-col overflow-hidden rounded-lg border border-neutral-800 bg-[#0b1428] text-neutral-200 shadow-inner shadow-black/40",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            data-status={status}
            className={cn(
              "inline-flex h-2.5 w-2.5 rounded-full transition-colors duration-150 ease-out",
              statusIndicatorClass,
            )}
          />
          <div className="flex flex-col leading-tight">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
              {title}
            </span>
            <span className="text-[11px] text-neutral-500">{statusLabel}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {showRetryButton ? (
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded-md border border-neutral-700 px-2 py-1 text-[11px] font-medium text-neutral-200 transition hover:border-neutral-500 hover:text-white"
            >
              <RefreshCw className="h-3 w-3" />
              Retry
            </button>
          ) : null}
        </div>
      </div>
      <div ref={containerRef} className="relative flex-1">
        <div ref={terminalRef} className="absolute inset-0" />
        {showSpinner ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b1428]/80 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin text-neutral-200" />
            <span>Connecting to runtime shell…</span>
          </div>
        ) : null}
        {status === "error" && errorMessage ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b1428]/85 px-4 text-center text-sm text-rose-300">
            <TerminalIcon className="h-5 w-5" />
            <p>{errorMessage}</p>
            <button
              type="button"
              onClick={handleRetry}
              className="inline-flex items-center gap-1 rounded-md border border-rose-400 px-2 py-1 text-[11px] font-medium text-rose-200 transition hover:border-rose-300 hover:text-rose-100"
            >
              <RefreshCw className="h-3 w-3" />
              Try again
            </button>
          </div>
        ) : null}
        {status === "unavailable" ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-[#0b1428]/85 px-4 text-center text-sm text-neutral-400">
            <TerminalIcon className="h-5 w-5" />
            <p>Terminal endpoint is not available for this environment.</p>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-800 px-3 py-2 text-[11px] text-neutral-500">
        <span>Shift+Insert to paste</span>
        <span>Ctrl+Shift+F to search</span>
      </div>
    </div>
  );
}
