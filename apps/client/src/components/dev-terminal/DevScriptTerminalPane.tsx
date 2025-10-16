import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Loader2, RefreshCcw, TerminalSquare } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useXTerm } from "@/components/xterm/use-xterm";
import { cn } from "@/lib/utils";

type ConnectionStatus = "idle" | "connecting" | "ready" | "error";

interface DevScriptTerminalPaneProps {
  serviceUrl: string;
  className?: string;
}

const ATTACH_ARGS = ["attach-session", "-r", "-t", "cmux:dev"] as const;

function toJsonResizeMessage(cols: number, rows: number): string {
  return JSON.stringify({ type: "resize", cols, rows });
}

export function DevScriptTerminalPane({
  serviceUrl,
  className,
}: DevScriptTerminalPaneProps) {
  const fitAddon = useMemo(() => new FitAddon(), []);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const baseUrlRef = useRef<string | null>(null);
  const socketCleanupRef = useRef<(() => void) | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const handleRetry = useCallback(() => {
    setReloadKey((key) => key + 1);
  }, []);

  const { ref: terminalRef, instance: terminal } = useXTerm({
    addons: [fitAddon],
    listeners: {
      onData: (data: string) => {
        const socket = socketRef.current;
        if (!socket || socket.readyState !== WebSocket.OPEN) {
          return;
        }
        try {
          socket.send(data);
        } catch (sendError) {
          console.warn("Failed to forward terminal input", sendError);
        }
      },
    },
  });

  const sendResize = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    if (!terminal) {
      return;
    }
    const cols = terminal.cols ?? 80;
    const rows = terminal.rows ?? 24;
    try {
      socket.send(toJsonResizeMessage(cols, rows));
    } catch (resizeError) {
      console.warn("Failed to send resize", resizeError);
    }
  }, [terminal]);

  const teardownSession = useCallback(() => {
    const socket = socketRef.current;
    if (socketCleanupRef.current) {
      try {
        socketCleanupRef.current();
      } catch (cleanupError) {
        console.warn("Error during socket cleanup", cleanupError);
      }
    } else if (socket) {
      try {
        socket.close();
      } catch (closeError) {
        console.warn("Error closing socket", closeError);
      }
    }
    socketCleanupRef.current = null;
    socketRef.current = null;

    const sessionId = sessionIdRef.current;
    if (sessionId) {
      sessionIdRef.current = null;
      const base = baseUrlRef.current ?? serviceUrl;
      try {
        const deleteUrl = new URL(`/api/tabs/${sessionId}`, base);
        void fetch(deleteUrl.toString(), { method: "DELETE" }).catch(() => {
          // Suppress cleanup errors
        });
      } catch (deleteError) {
        console.warn("Failed to request terminal teardown", deleteError);
      }
    }
  }, [serviceUrl]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      teardownSession();
    };
  }, [teardownSession]);

  useEffect(() => {
    if (!terminal) {
      return;
    }
    if (!serviceUrl) {
      setStatus("error");
      setError("Missing terminal endpoint");
      return;
    }

    let disposed = false;
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const connect = async () => {
      setStatus("connecting");
      setError(null);

      let base: URL;
      try {
        base = new URL(serviceUrl);
        baseUrlRef.current = base.toString();
      } catch (urlError) {
        if (!disposed) {
          setStatus("error");
          setError("Invalid terminal URL");
        }
        return;
      }

      const initialCols = terminal.cols ?? 80;
      const initialRows = terminal.rows ?? 24;
      const tabsUrl = new URL("/api/tabs", base);

      try {
        const response = await fetch(tabsUrl.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cmd: "tmux",
            args: Array.from(ATTACH_ARGS),
            cols: initialCols,
            rows: initialRows,
          }),
          signal: abortController.signal,
        });

        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || `Failed to create terminal (${response.status})`);
        }

        const payload = (await response.json()) as { id: string };
        if (disposed) {
          return;
        }

        sessionIdRef.current = payload.id;

        const wsUrl = new URL(`/ws/${payload.id}`, base);
        if (wsUrl.protocol === "https:") {
          wsUrl.protocol = "wss:";
        } else if (wsUrl.protocol === "http:") {
          wsUrl.protocol = "ws:";
        }

        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const decoder = decoderRef.current;

        const handleOpen = () => {
          if (disposed) {
            return;
          }
          setStatus("ready");
          fitAddon.fit();
          sendResize();
        };

        const handleMessage = (event: MessageEvent) => {
          if (!terminal) {
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            const content = decoder.decode(new Uint8Array(event.data));
            terminal.write(content);
          } else if (typeof event.data === "string") {
            terminal.write(event.data);
          }
        };

        const handleError = () => {
          if (disposed) {
            return;
          }
          setStatus("error");
          setError("Terminal connection error");
        };

        const handleClose = () => {
          socketRef.current = null;
          if (disposed) {
            return;
          }
          setStatus((current) => (current === "error" ? current : "idle"));
          setError((previous) => previous ?? "Terminal session closed");
          const sessionId = sessionIdRef.current;
          if (sessionId) {
            sessionIdRef.current = null;
            try {
              const deleteUrl = new URL(`/api/tabs/${sessionId}`, base);
              void fetch(deleteUrl.toString(), { method: "DELETE" }).catch(() => {
                // Ignore cleanup errors when connection closes unexpectedly.
              });
            } catch (deleteError) {
              console.warn("Failed to cleanup terminal session", deleteError);
            }
          }
        };

        socket.addEventListener("open", handleOpen);
        socket.addEventListener("message", handleMessage);
        socket.addEventListener("error", handleError);
        socket.addEventListener("close", handleClose);

        socketCleanupRef.current = () => {
          socket.removeEventListener("open", handleOpen);
          socket.removeEventListener("message", handleMessage);
          socket.removeEventListener("error", handleError);
          socket.removeEventListener("close", handleClose);
          try {
            if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
              socket.close();
            }
          } catch (closeError) {
            console.warn("Error closing terminal socket", closeError);
          }
        };
      } catch (connectError) {
        if (disposed) {
          return;
        }
        if (connectError instanceof DOMException && connectError.name === "AbortError") {
          return;
        }
        console.error("Failed to initialise dev terminal", connectError);
        setStatus("error");
        setError(
          connectError instanceof Error ? connectError.message : "Failed to connect to dev terminal",
        );
        teardownSession();
      }
    };

    void connect();

    return () => {
      disposed = true;
      abortController.abort();
      abortControllerRef.current = null;
      teardownSession();
    };
  }, [serviceUrl, terminal, fitAddon, sendResize, reloadKey, teardownSession]);

  useEffect(() => {
    const container = terminalRef.current;
    if (!container || !terminal) {
      return;
    }

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      fitAddon.fit();
      sendResize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [terminal, fitAddon, sendResize, terminalRef]);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border-l border-neutral-200 bg-neutral-950 dark:border-neutral-800",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
          <TerminalSquare className="h-3.5 w-3.5" />
          Dev Script Terminal
        </div>
        <div className="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400">
          {status === "connecting" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting…
            </span>
          ) : status === "ready" ? (
            <span className="text-neutral-400 dark:text-neutral-500">Live</span>
          ) : status === "error" ? (
            <span className="text-red-400 dark:text-red-300">Error</span>
          ) : null}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100"
            onClick={handleRetry}
            disabled={status === "connecting"}
            aria-label="Reconnect terminal"
          >
            <RefreshCcw className={cn("h-3.5 w-3.5", status === "connecting" ? "animate-spin" : undefined)} />
          </Button>
        </div>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <div ref={terminalRef} className="h-full w-full" />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-neutral-950/80 px-6 text-center text-xs text-neutral-300">
            {error ?? (status === "connecting" ? "Connecting to terminal…" : "Terminal not available")}
          </div>
        ) : null}
      </div>
    </div>
  );
}
