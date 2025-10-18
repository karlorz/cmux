import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { AttachAddon } from "@xterm/addon-attach";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";

import { createTerminalOptions } from "@cmux/shared/terminal-config";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw } from "lucide-react";

type TerminalStatus = "idle" | "connecting" | "connected" | "error";

export interface DevScriptTerminalProps {
  baseUrl: string | null;
  isVisible: boolean;
  className?: string;
}

function buildApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/u, "")}${path}`;
}

function buildWebSocketUrl(baseUrl: string, path: string): string {
  const url = new URL(buildApiUrl(baseUrl, path));
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export function DevScriptTerminal({
  baseUrl,
  isVisible,
  className,
}: DevScriptTerminalProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const [status, setStatus] = useState<TerminalStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const canActivate = Boolean(baseUrl && isVisible);

  const disposeTerminal = useCallback(async () => {
    if (resizeObserverRef.current && containerRef.current) {
      resizeObserverRef.current.unobserve(containerRef.current);
    }
    resizeObserverRef.current?.disconnect();
    resizeObserverRef.current = null;

    if (socketRef.current) {
      try {
        socketRef.current.close();
      } catch {
        // ignore socket close errors
      }
    }
    socketRef.current = null;

    if (attachAddonRef.current) {
      attachAddonRef.current.dispose();
    }
    attachAddonRef.current = null;

    fitAddonRef.current = null;

    if (terminalRef.current) {
      terminalRef.current.dispose();
    }
    terminalRef.current = null;

    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;

    if (baseUrl && sessionId) {
      try {
        await fetch(buildApiUrl(baseUrl, `/api/tabs/${sessionId}`), {
          method: "DELETE",
        });
      } catch {
        // ignore cleanup errors
      }
    }
  }, [baseUrl]);

  useEffect(() => {
    if (!canActivate) {
      void disposeTerminal();
      return undefined;
    }

    let disposed = false;
    const terminal = new Terminal(
      createTerminalOptions({
        convertEol: true,
        scrollback: 200_000,
        cursorBlink: true,
      }),
    );
    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());

    const mount = containerRef.current;
    if (!mount) {
      setStatus("error");
      setErrorMessage("Terminal container not available");
      terminal.dispose();
      return undefined;
    }

    terminal.open(mount);
    fitAddon.fit();
    terminal.focus();

    const resize = () => {
      fitAddon.fit();
      const socket = socketRef.current;
      if (socket && socket.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify({
          type: "resize",
          cols: terminal.cols,
          rows: terminal.rows,
        });
        socket.send(payload);
      }
    };

    const observer = new ResizeObserver(resize);
    resizeObserverRef.current = observer;
    observer.observe(mount);
    window.addEventListener("resize", resize);

    const controller = new AbortController();
    const currentBaseUrl = baseUrl!;

    const setup = async () => {
      try {
        setStatus("connecting");
        setErrorMessage(null);

        const cols = terminal.cols;
        const rows = terminal.rows;
        const response = await fetch(buildApiUrl(currentBaseUrl, "/api/tabs"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cmd: "tmux",
            args: ["attach-session", "-t", "cmux:dev"],
            cols,
            rows,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Failed to create terminal (${response.status})`);
        }

        const payload = (await response.json()) as { id: string; ws_url: string };
        sessionIdRef.current = payload.id;

        const wsUrl = buildWebSocketUrl(currentBaseUrl, payload.ws_url);
        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";

        const attachAddon = new AttachAddon(socket, { bidirectional: true });
        attachAddonRef.current = attachAddon;
        terminal.loadAddon(attachAddon);

        socketRef.current = socket;

        socket.addEventListener("open", () => {
          if (disposed) return;
          setStatus("connected");
          resize();
        });

        socket.addEventListener("close", () => {
          if (disposed) return;
          setStatus("error");
          setErrorMessage("Connection closed");
        });

        socket.addEventListener("error", (event) => {
          if (disposed) return;
          console.warn("Dev script terminal socket error", event);
          setStatus("error");
          setErrorMessage("Failed to connect to terminal");
        });
      } catch (error) {
        if (disposed) return;
        if (controller.signal.aborted) {
          return;
        }
        console.error("Failed to initialise dev script terminal", error);
        setStatus("error");
        setErrorMessage(
          error instanceof Error ? error.message : "Unknown terminal error",
        );
      }
    };

    void setup();

    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener("resize", resize);
      void disposeTerminal();
    };
  }, [baseUrl, canActivate, disposeTerminal, refreshKey]);

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connecting":
        return "Connecting to dev script terminal";
      case "connected":
        return "Dev script terminal connected";
      case "error":
        return errorMessage ?? "Unable to connect to dev script terminal";
      default:
        return "Dev script terminal";
    }
  }, [errorMessage, status]);

  const retry = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return (
    <div
      className={cn(
        "flex h-full min-h-0 flex-col bg-neutral-950 text-neutral-200",
        "dark:bg-neutral-950",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b border-neutral-800 px-3 py-2 text-xs font-medium">
        <div className="flex items-center gap-2 text-neutral-300">
          {status === "connecting" ? (
            <Loader2 className="size-4 animate-spin" />
          ) : null}
          <span className="truncate" title={statusLabel}>
            {statusLabel}
          </span>
        </div>
        {status === "error" ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={retry}
            className="h-7 px-2 text-xs text-neutral-200 hover:text-neutral-50"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </Button>
        ) : null}
      </div>
      <div className="relative flex-1">
        <div
          ref={containerRef}
          className="absolute inset-0"
          style={{ backgroundColor: "#050505" }}
        />
      </div>
    </div>
  );
}
