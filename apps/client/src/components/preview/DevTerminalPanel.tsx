import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { useXTerm } from "@/components/xterm/use-xterm";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { RefreshCcw, AlertTriangle, Ban, TerminalSquare } from "lucide-react";

type TerminalStatus =
  | "idle"
  | "starting"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error"
  | "unavailable";

export interface DevTerminalPanelProps {
  baseUrl: string | null;
  tmuxTarget?: string;
  className?: string;
}

interface SessionInfo {
  id: string;
  wsUrl: string;
}

const STATUS_LABEL: Record<TerminalStatus, string> = {
  idle: "Idle",
  starting: "Starting",
  connecting: "Connecting",
  connected: "Connected",
  disconnected: "Disconnected",
  error: "Error",
  unavailable: "Unavailable",
};

const STATUS_TONE: Record<TerminalStatus, string> = {
  idle: "text-neutral-400",
  starting: "text-neutral-300",
  connecting: "text-neutral-200",
  connected: "text-emerald-400",
  disconnected: "text-amber-400",
  error: "text-rose-400",
  unavailable: "text-neutral-500",
};

export function DevTerminalPanel({
  baseUrl,
  tmuxTarget = "cmux:dev",
  className,
}: DevTerminalPanelProps) {
  const fitAddon = useMemo(() => new FitAddon(), []);
  const webLinksAddon = useMemo(() => new WebLinksAddon(), []);

  const { ref: terminalElRef, instance: terminal } = useXTerm({
    addons: [fitAddon, webLinksAddon],
    options: {
      fontSize: 13,
      allowProposedApi: true,
      theme: {
        background: "#0b1221",
        foreground: "#e4e8f1",
        cursor: "#38bdf8",
        selectionBackground: "rgba(56, 189, 248, 0.25)",
      },
    },
  });

  const containerRef = useRef<HTMLDivElement | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  const decoderRef = useRef(new TextDecoder());
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryToken, setRetryToken] = useState(0);

  const resetDecoder = useCallback(() => {
    decoderRef.current = new TextDecoder();
  }, []);

  const teardownSession = useCallback(
    async (options?: { soft?: boolean }) => {
      const { soft = false } = options ?? {};
      const socket = socketRef.current;
      if (socket) {
        try {
          socket.onopen = null;
          socket.onmessage = null;
          socket.onerror = null;
          socket.onclose = null;
          if (socket.readyState === WebSocket.OPEN) {
            socket.close();
          }
        } catch {
          // ignore
        }
      }
      socketRef.current = null;

      const session = sessionRef.current;
      sessionRef.current = null;

      if (!soft && session && baseUrl) {
        try {
          const url = new URL(`/api/tabs/${session.id}`, baseUrl);
          await fetch(url.toString(), { method: "DELETE" });
        } catch {
          // ignore cleanup failures
        }
      }
      resetDecoder();
    },
    [baseUrl, resetDecoder],
  );

  const sendResize = useCallback(() => {
    const socket = socketRef.current;
    const cols = terminal?.cols ?? 80;
    const rows = terminal?.rows ?? 24;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const payload = JSON.stringify({
      type: "resize",
      cols,
      rows,
    });
    try {
      socket.send(payload);
    } catch {
      // ignore send failure
    }
  }, [terminal]);

  useEffect(() => {
    if (!terminal) return;
    const handleData = terminal.onData((data) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    const handleBinary = terminal.onBinary((data) => {
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(data);
      }
    });

    return () => {
      handleData.dispose();
      handleBinary.dispose();
    };
  }, [terminal]);

  useEffect(() => {
    if (!terminal) return;
    if (!containerRef.current) return;

    const handleResize = () => {
      fitAddon.fit();
      sendResize();
    };

    handleResize();

    const observer = new ResizeObserver(() => {
      handleResize();
    });
    observer.observe(containerRef.current);

    window.addEventListener("resize", handleResize);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
    };
  }, [terminal, fitAddon, sendResize]);

  useEffect(() => {
    return () => {
      void teardownSession();
    };
  }, [teardownSession]);

  useEffect(() => {
    if (!terminal) return;
    if (!baseUrl) {
      setStatus("unavailable");
      setErrorMessage("Terminal service URL unavailable for this run");
      void teardownSession({ soft: true });
      return;
    }

    let cancelled = false;

    const createSession = async () => {
      setStatus("starting");
      setErrorMessage(null);

      try {
        const url = new URL("/api/tabs", baseUrl);
        const response = await fetch(url.toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            cmd: "tmux",
            args: ["attach-session", "-t", tmuxTarget],
            cols: terminal.cols ?? 80,
            rows: terminal.rows ?? 24,
          }),
        });

        if (!response.ok) {
          throw new Error(`Request failed (${response.status})`);
        }

        const payload = (await response.json()) as SessionInfo;
        if (cancelled) {
          await fetch(new URL(`/api/tabs/${payload.id}`, baseUrl).toString(), {
            method: "DELETE",
          });
          return;
        }

        sessionRef.current = payload;
        setStatus("connecting");

        const wsUrl = new URL(payload.wsUrl, baseUrl);
        wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        socket.onopen = () => {
          if (cancelled) return;
          setStatus("connected");
          terminal.focus();
          fitAddon.fit();
          sendResize();
        };

        socket.onmessage = (event: MessageEvent) => {
          if (cancelled) return;
          if (!terminal) return;
          if (typeof event.data === "string") {
            terminal.write(event.data);
            return;
          }
          if (event.data instanceof ArrayBuffer) {
            const text = decoderRef.current.decode(new Uint8Array(event.data), {
              stream: true,
            });
            if (text) {
              terminal.write(text);
            }
          }
        };

        socket.onerror = () => {
          if (cancelled) return;
          setStatus("error");
          setErrorMessage("WebSocket error while streaming terminal output");
        };

        socket.onclose = () => {
          if (cancelled) return;
          socketRef.current = null;
          setStatus((prev) => (prev === "error" ? prev : "disconnected"));
        };
      } catch (error) {
        if (cancelled) return;
        setStatus("error");
        setErrorMessage(
          error instanceof Error
            ? error.message
            : "Unable to start terminal session",
        );
      }
    };

    void teardownSession({ soft: true }).then(() => {
      if (!cancelled) {
        void createSession();
      }
    });

    return () => {
      cancelled = true;
      void teardownSession();
    };
  }, [baseUrl, tmuxTarget, terminal, teardownSession, fitAddon, sendResize, retryToken]);

  const handleRetry = useCallback(() => {
    setRetryToken((value) => value + 1);
  }, []);

  const statusTone = STATUS_TONE[status];

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col overflow-hidden border-l border-neutral-200/70 bg-neutral-950/95 backdrop-blur-md dark:border-neutral-800/70",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-neutral-200/60 px-3 py-2 dark:border-neutral-800/60">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-neutral-400 dark:text-neutral-500">
            <TerminalSquare className="h-3.5 w-3.5" />
            Dev Terminal
          </div>
          <p className="mt-1 text-sm font-semibold text-neutral-100">
            tmux attach {tmuxTarget}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs font-medium", statusTone)}>
            {STATUS_LABEL[status]}
          </span>
          {status === "error" || status === "disconnected" ? (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRetry}
              className="border-neutral-400/40 bg-neutral-900/60 text-neutral-100 hover:bg-neutral-800/80"
            >
              <RefreshCcw className="mr-2 h-3.5 w-3.5" />
              Retry
            </Button>
          ) : null}
        </div>
      </div>
      <div className="relative flex-1 bg-neutral-950" ref={containerRef}>
        <div ref={terminalElRef} className="absolute inset-0" />
        {status === "unavailable" ? (
          <EmptyState
            icon={<Ban className="h-6 w-6" />}
            title="Terminal not exposed"
            description="This environment does not expose the dev terminal service."
          />
        ) : null}
        {status === "error" ? (
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Connection issue"
            description={errorMessage ?? "Unable to connect to the dev terminal."}
            actionLabel="Retry"
            onAction={handleRetry}
          />
        ) : null}
        {status === "disconnected" ? (
          <EmptyState
            icon={<AlertTriangle className="h-6 w-6" />}
            title="Terminal disconnected"
            description="The tmux session ended or the connection was closed."
            actionLabel="Reconnect"
            onAction={handleRetry}
          />
        ) : null}
      </div>
      <div className="flex items-center justify-between border-t border-neutral-200/40 bg-neutral-950 px-3 py-2 text-xs text-neutral-400 dark:border-neutral-800/50 dark:text-neutral-500">
        <span>Shift+Insert to paste</span>
        <span>Ctrl+Shift+F to search</span>
      </div>
    </div>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-950/90 text-center backdrop-blur-sm">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-neutral-900 text-neutral-200">
        {icon}
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-neutral-100">{title}</p>
        <p className="text-xs text-neutral-400">{description}</p>
      </div>
      {actionLabel ? (
        <Button
          size="sm"
          variant="secondary"
          onClick={onAction}
          className="bg-neutral-900 text-neutral-100 hover:bg-neutral-800"
        >
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
