import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { useXTerm } from "./xterm/use-xterm";

interface DevTerminalProps {
  className?: string;
  onErrorDetected?: () => void;
}

export function DevTerminal({ className = "", onErrorDetected }: DevTerminalProps) {
  const fitAddon = useMemo(() => new FitAddon(), []);
  const webLinksAddon = useMemo(() => new WebLinksAddon(), []);
  const addons = useMemo(
    () => [fitAddon, webLinksAddon],
    [fitAddon, webLinksAddon]
  );

  const [isConnected, setIsConnected] = useState(false);
  const [hasError, setHasError] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const errorDetectedRef = useRef(false);

  const { ref: terminalRef, instance: terminal } = useXTerm({
    addons,
  });

  useEffect(() => {
    if (!terminal || errorDetectedRef.current) return;

    const errorPatterns = [
      "error:",
      "failed",
      "exception",
      "cannot find",
      "enoent",
      "eaddrinuse",
      "econnrefused",
      "npm err",
      "syntax error",
      "webpack compiled with",
      "compilation error",
    ];

    const checkForErrors = () => {
      if (errorDetectedRef.current) return;

      const buffer = terminal.buffer.active;
      for (let i = 0; i < buffer.length; i++) {
        const line = buffer.getLine(i);
        if (!line) continue;

        const lineText = line.translateToString(true).toLowerCase();
        if (errorPatterns.some((pattern) => lineText.includes(pattern))) {
          errorDetectedRef.current = true;
          onErrorDetected?.();
          break;
        }
      }
    };

    const dispose = terminal.onRender(() => {
      checkForErrors();
    });

    return () => {
      dispose.dispose();
    };
  }, [terminal, onErrorDetected]);

  useEffect(() => {
    if (!terminal) return;

    const fitAndResize = () => {
      if (fitAddon) {
        fitAddon.fit();
      }
    };

    fitAndResize();
    window.addEventListener("resize", fitAndResize);

    return () => {
      window.removeEventListener("resize", fitAndResize);
    };
  }, [terminal, fitAddon]);

  useEffect(() => {
    if (!terminal) return;

    let disposed = false;

    const createTerminalSession = async () => {
      try {
        const dims = { cols: terminal.cols, rows: terminal.rows };

        const response = await fetch("/api/tabs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cmd: "tmux",
            args: ["attach", "-t", "cmux:dev"],
            cols: dims.cols,
            rows: dims.rows,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to create terminal session: ${response.status}`);
        }

        const payload = await response.json();
        if (disposed) return;

        sessionIdRef.current = payload.id;

        const wsUrl = new URL(`/ws/${payload.id}`, window.location.origin);
        wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

        const socket = new WebSocket(wsUrl);
        socket.binaryType = "arraybuffer";
        socketRef.current = socket;

        const attachAddon = new AttachAddon(socket, { bidirectional: true });
        attachAddonRef.current = attachAddon;
        terminal.loadAddon(attachAddon);

        socket.addEventListener("open", () => {
          if (disposed) return;
          setIsConnected(true);
          setHasError(false);
          fitAddon.fit();
          terminal.focus();

          setTimeout(() => {
            fitAddon.fit();
            const dims = { cols: terminal.cols, rows: terminal.rows };
            socket.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
          }, 100);
        });

        socket.addEventListener("close", () => {
          if (disposed) return;
          setIsConnected(false);
        });

        socket.addEventListener("error", () => {
          if (disposed) return;
          setHasError(true);
          setIsConnected(false);
        });
      } catch (error) {
        if (disposed) return;
        console.error("Failed to create terminal session:", error);
        setHasError(true);
        setIsConnected(false);
      }
    };

    void createTerminalSession();

    return () => {
      disposed = true;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.close();
      }
      attachAddonRef.current?.dispose();

      if (sessionIdRef.current) {
        fetch(`/api/tabs/${sessionIdRef.current}`, { method: "DELETE" }).catch(
          () => {}
        );
      }
    };
  }, [terminal, fitAddon]);

  return (
    <div className={className}>
      <div className="h-full flex flex-col bg-neutral-950">
        <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-800 bg-neutral-900">
          <div className="flex items-center gap-2">
            <div className="text-xs font-medium text-neutral-300">
              Dev Server
            </div>
            <div
              className={`w-2 h-2 rounded-full ${
                isConnected
                  ? "bg-green-500"
                  : hasError
                    ? "bg-red-500"
                    : "bg-yellow-500"
              }`}
              title={
                isConnected
                  ? "Connected"
                  : hasError
                    ? "Error"
                    : "Connecting..."
              }
            />
          </div>
          <div className="text-xs text-neutral-500">
            tmux session: cmux:dev
          </div>
        </div>
        <div className="flex-1 overflow-hidden" ref={terminalRef} />
      </div>
    </div>
  );
}
