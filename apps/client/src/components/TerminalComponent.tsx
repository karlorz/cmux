import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { AttachAddon } from "@xterm/addon-attach";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useMemo, useRef } from "react";
import { useXTerm } from "./xterm/use-xterm";

interface TerminalComponentProps {
  taskRunId: string;
}

export function TerminalComponent({ taskRunId }: TerminalComponentProps) {
  const fitAddon = useMemo(() => new FitAddon(), []);
  const webLinksAddon = useMemo(() => new WebLinksAddon(), []);
  const addons = useMemo(
    () => [fitAddon, webLinksAddon],
    [fitAddon, webLinksAddon]
  );

  const { ref: terminalRef, instance: terminal } = useXTerm({
    addons,
  });

  const socketRef = useRef<WebSocket | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);

  useEffect(() => {
    if (!terminal) return;

    const handleResize = () => {
      if (fitAddon) {
        fitAddon.fit();
      }
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        const dims = fitAddon.proposeDimensions();
        if (dims) {
          socketRef.current.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      }
    };

    fitAddon.fit();

    window.addEventListener("resize", handleResize);

    // Connect to WebSocket
    const wsUrl = `ws://localhost:39383/ws/${taskRunId}`;
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    socket.addEventListener("open", () => {
      console.log("Terminal WebSocket connected");
      const dims = fitAddon.proposeDimensions();
      if (dims) {
        socket.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      }
    });

    socket.addEventListener("close", () => {
      console.log("Terminal WebSocket closed");
    });

    socket.addEventListener("error", (error) => {
      console.error("Terminal WebSocket error:", error);
    });

    const attachAddon = new AttachAddon(socket);
    attachAddonRef.current = attachAddon;
    terminal.loadAddon(attachAddon);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (socketRef.current) {
        socketRef.current.close();
      }
      if (attachAddonRef.current) {
        attachAddonRef.current.dispose();
      }
      terminal.dispose();
    };
  }, [terminal, fitAddon, taskRunId]);

  return (
    <div
      ref={terminalRef}
      style={{
        width: "100%",
        height: "100%",
        backgroundColor: "#1e1e1e",
      }}
    />
  );
}