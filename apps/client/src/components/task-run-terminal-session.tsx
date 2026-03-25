import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { FitAddon } from "ghostty-web";
import type { Terminal as GhosttyTerminal } from "ghostty-web";
import { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import {
  ACTIVE_TERMINAL_SCROLLBACK,
  DEFAULT_TERMINAL_CONFIG,
  INACTIVE_TERMINAL_SCROLLBACK,
} from "@cmux/shared/terminal-config";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import clsx from "clsx";
import { getTerminalRenderer } from "@/lib/terminal-renderer";
import { useGhostty } from "./ghostty/use-ghostty";
import { useXTerm } from "./xterm/use-xterm";

const MIN_COLS = 20;
const MAX_COLS = 320;
const MIN_ROWS = 8;
const MAX_ROWS = 120;

export type TerminalConnectionState =
  | "connecting"
  | "open"
  | "closed"
  | "error";

interface TaskRunTerminalSessionProps {
  baseUrl: string;
  terminalId: string;
  isActive: boolean;
  onConnectionStateChange?: (state: TerminalConnectionState) => void;
}

interface TerminalSessionRendererProps extends TaskRunTerminalSessionProps {
  renderer: "xterm" | "ghostty";
}

type ResizableTerminal = XTermTerminal | GhosttyTerminal;

function clampDimension(value: number, min: number, max: number, fallback: number) {
  const next = Number.isFinite(value) && value > 0 ? Math.round(value) : fallback;
  return Math.max(min, Math.min(max, next));
}

function getScrollbackForState(isActive: boolean) {
  return isActive ? ACTIVE_TERMINAL_SCROLLBACK : INACTIVE_TERMINAL_SCROLLBACK;
}

function useTerminalSocket({
  baseUrl,
  isActive,
  terminal,
  terminalId,
  measureAndQueueResize,
  flushPendingResize,
  notifyConnectionState,
}: {
  baseUrl: string;
  isActive: boolean;
  terminal: ResizableTerminal | null;
  terminalId: string;
  measureAndQueueResize: () => void;
  flushPendingResize: () => void;
  notifyConnectionState: (next: TerminalConnectionState) => void;
}) {
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!terminal) {
      notifyConnectionState("connecting");
      return undefined;
    }

    if (!isActive) {
      notifyConnectionState("closed");
      return undefined;
    }

    let cancelled = false;
    const base = new URL(baseUrl);
    const wsUrl = new URL(`/sessions/${terminalId}/ws`, base);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

    terminal.clear();

    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    notifyConnectionState("connecting");

    const handleOpen = () => {
      if (cancelled) {
        return;
      }
      notifyConnectionState("open");
      measureAndQueueResize();
      flushPendingResize();
    };

    const handleMessage = (event: MessageEvent<ArrayBuffer | string>) => {
      if (cancelled) {
        return;
      }

      const payload =
        typeof event.data === "string"
          ? event.data
          : new Uint8Array(event.data);

      terminal.write(payload);
    };

    const handleClose = () => {
      if (cancelled) {
        return;
      }
      notifyConnectionState("closed");
    };

    const handleError = () => {
      if (cancelled) {
        return;
      }
      notifyConnectionState("error");
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("message", handleMessage);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);

    return () => {
      cancelled = true;
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("message", handleMessage);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }

      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [
    baseUrl,
    flushPendingResize,
    isActive,
    measureAndQueueResize,
    notifyConnectionState,
    terminal,
    terminalId,
  ]);

  return socketRef;
}

function useTerminalResize({
  containerRef,
  fitAddonRef,
  isActive,
  socketRef,
  terminal,
}: {
  containerRef: RefObject<HTMLDivElement | null>;
  fitAddonRef: RefObject<{ fit(): void } | null>;
  isActive: boolean;
  socketRef: RefObject<WebSocket | null>;
  terminal: ResizableTerminal | null;
}) {
  const pendingResizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const lastSentResizeRef = useRef<{ cols: number; rows: number } | null>(null);

  const queueResize = useCallback(() => {
    if (!terminal) {
      pendingResizeRef.current = null;
      return;
    }

    const cols = clampDimension(terminal.cols, MIN_COLS, MAX_COLS, 80);
    const rows = clampDimension(terminal.rows, MIN_ROWS, MAX_ROWS, 24);
    const current = { cols, rows };

    const last = lastSentResizeRef.current;
    if (last && last.cols === current.cols && last.rows === current.rows) {
      pendingResizeRef.current = null;
      return;
    }

    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "resize", cols: current.cols, rows: current.rows }));
      lastSentResizeRef.current = current;
      pendingResizeRef.current = null;
    } else {
      pendingResizeRef.current = current;
    }
  }, [socketRef, terminal]);

  const measureAndQueueResize = useCallback(() => {
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) {
      return;
    }
    fitAddon.fit();
    queueResize();
  }, [fitAddonRef, queueResize, terminal]);

  const flushPendingResize = useCallback(() => {
    if (!pendingResizeRef.current) {
      return;
    }
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      const next = pendingResizeRef.current;
      pendingResizeRef.current = null;
      socket.send(JSON.stringify({ type: "resize", cols: next.cols, rows: next.rows }));
      lastSentResizeRef.current = next;
    }
  }, [socketRef]);

  useEffect(() => {
    if (!terminal || !isActive) {
      return;
    }

    const disposable = terminal.onResize(() => {
      queueResize();
    });

    return () => {
      disposable.dispose();
    };
  }, [isActive, queueResize, terminal]);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }

    const container = containerRef.current;
    if (!container) {
      return undefined;
    }

    let frame = 0;
    const handle = () => {
      frame = window.requestAnimationFrame(() => {
        measureAndQueueResize();
      });
    };

    const observer = new ResizeObserver(handle);
    observer.observe(container);
    window.addEventListener("resize", handle);

    measureAndQueueResize();

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handle);
      window.cancelAnimationFrame(frame);
    };
  }, [containerRef, isActive, measureAndQueueResize]);

  return {
    flushPendingResize,
    measureAndQueueResize,
    resetResizeTracking: () => {
      pendingResizeRef.current = null;
      lastSentResizeRef.current = null;
    },
  };
}

function TerminalStatusOverlay({ connectionState }: { connectionState: TerminalConnectionState }) {
  const statusMessage = useMemo(() => {
    switch (connectionState) {
      case "open":
        return null;
      case "error":
        return "Failed to connect to the terminal backend.";
      case "closed":
        return "Terminal connection closed.";
      case "connecting":
      default:
        return "Connecting to terminal…";
    }
  }, [connectionState]);

  if (!statusMessage) {
    return null;
  }

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/60 pointer-events-none">
      <span className="text-sm text-neutral-200 dark:text-neutral-300">{statusMessage}</span>
    </div>
  );
}

function XTermTaskRunTerminalSession({
  baseUrl,
  terminalId,
  isActive,
  onConnectionStateChange,
}: TaskRunTerminalSessionProps) {
  const callbackRef = useRef<TaskRunTerminalSessionProps["onConnectionStateChange"]>(
    onConnectionStateChange
  );
  useEffect(() => {
    callbackRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  const [connectionState, setConnectionState] = useState<TerminalConnectionState>(
    "connecting"
  );

  const notifyConnectionState = useCallback((next: TerminalConnectionState) => {
    setConnectionState(next);
    callbackRef.current?.(next);
  }, []);

  const socketRef = useRef<WebSocket | null>(null);

  const handleTerminalData = useCallback((data: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  }, []);

  const { ref: containerRef, instance: terminal } = useXTerm({
    listeners: {
      onData: handleTerminalData,
    },
  });

  const scrollback = getScrollbackForState(isActive);

  useEffect(() => {
    if (!terminal) {
      return;
    }

    if (terminal.options.scrollback !== scrollback) {
      terminal.options.scrollback = scrollback;
    }

    if (!isActive) {
      terminal.clear();
    }
  }, [isActive, scrollback, terminal]);

  const fitAddonRef = useRef<XTermFitAddon | null>(null);

  useEffect(() => {
    if (!terminal) {
      fitAddonRef.current = null;
      return;
    }

    const fitAddon = new XTermFitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(unicodeAddon);

    fitAddonRef.current = fitAddon;

    return () => {
      fitAddon.dispose();
      webLinksAddon.dispose();
      searchAddon.dispose();
      unicodeAddon.dispose();
      fitAddonRef.current = null;
    };
  }, [terminal]);

  useEffect(() => {
    if (!terminal || !isActive) {
      return;
    }

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch (error) {
      console.warn("[TaskRunTerminalSession] WebGL addon unavailable", error);
      webglAddon?.dispose();
      webglAddon = null;
    }

    return () => {
      webglAddon?.dispose();
    };
  }, [isActive, terminal]);

  const { flushPendingResize, measureAndQueueResize, resetResizeTracking } =
    useTerminalResize({
      containerRef,
      fitAddonRef,
      isActive,
      socketRef,
      terminal,
    });

  useTerminalSocket({
    baseUrl,
    isActive,
    terminal,
    terminalId,
    measureAndQueueResize,
    flushPendingResize,
    notifyConnectionState,
  });

  useEffect(() => {
    resetResizeTracking();
  }, [baseUrl, resetResizeTracking, terminalId]);

  useEffect(() => {
    if (!terminal || !isActive) {
      return;
    }

    measureAndQueueResize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminal.focus();
      });
    });
  }, [isActive, measureAndQueueResize, terminal]);

  return (
    <div
      className={clsx("relative w-full h-full", { hidden: !isActive })}
      role="tabpanel"
      aria-hidden={!isActive}
      data-terminal-id={terminalId}
      data-terminal-renderer="xterm"
    >
      <div ref={containerRef} className="absolute inset-0" />
      <TerminalStatusOverlay connectionState={connectionState} />
    </div>
  );
}

function GhosttyTaskRunTerminalSession({
  baseUrl,
  terminalId,
  isActive,
  onConnectionStateChange,
}: TaskRunTerminalSessionProps) {
  const callbackRef = useRef<TaskRunTerminalSessionProps["onConnectionStateChange"]>(
    onConnectionStateChange
  );
  useEffect(() => {
    callbackRef.current = onConnectionStateChange;
  }, [onConnectionStateChange]);

  const [connectionState, setConnectionState] = useState<TerminalConnectionState>(
    "connecting"
  );

  const notifyConnectionState = useCallback((next: TerminalConnectionState) => {
    setConnectionState(next);
    callbackRef.current?.(next);
  }, []);

  const socketRef = useRef<WebSocket | null>(null);

  const handleTerminalData = useCallback((data: string) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(data);
    }
  }, []);

  const scrollback = getScrollbackForState(isActive);

  const ghosttyOptions = useMemo(
    () => ({
      cols: 80,
      rows: 24,
      fontSize: DEFAULT_TERMINAL_CONFIG.fontSize,
      fontFamily: DEFAULT_TERMINAL_CONFIG.fontFamily,
      cursorStyle: DEFAULT_TERMINAL_CONFIG.cursorStyle,
      cursorBlink: true,
      scrollback,
      theme: DEFAULT_TERMINAL_CONFIG.theme,
    }),
    [scrollback]
  );

  const { ref: containerRef, instance: terminal } = useGhostty({
    listeners: {
      onData: handleTerminalData,
    },
    options: ghosttyOptions,
  });

  useEffect(() => {
    if (!terminal) {
      return;
    }

    if (terminal.options.scrollback !== scrollback) {
      terminal.options.scrollback = scrollback;
    }

    if (!isActive) {
      terminal.clear();
    }
  }, [isActive, scrollback, terminal]);

  const fitAddonRef = useRef<FitAddon | null>(null);

  useEffect(() => {
    if (!terminal) {
      fitAddonRef.current = null;
      return;
    }

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;

    return () => {
      fitAddon.dispose();
      fitAddonRef.current = null;
    };
  }, [terminal]);

  const { flushPendingResize, measureAndQueueResize, resetResizeTracking } =
    useTerminalResize({
      containerRef,
      fitAddonRef,
      isActive,
      socketRef,
      terminal,
    });

  useTerminalSocket({
    baseUrl,
    isActive,
    terminal,
    terminalId,
    measureAndQueueResize,
    flushPendingResize,
    notifyConnectionState,
  });

  useEffect(() => {
    resetResizeTracking();
  }, [baseUrl, resetResizeTracking, terminalId]);

  useEffect(() => {
    if (!terminal || !isActive) {
      return;
    }

    measureAndQueueResize();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        terminal.focus();
      });
    });
  }, [isActive, measureAndQueueResize, terminal]);

  return (
    <div
      className={clsx("relative w-full h-full", { hidden: !isActive })}
      role="tabpanel"
      aria-hidden={!isActive}
      data-terminal-id={terminalId}
      data-terminal-renderer="ghostty"
    >
      <div ref={containerRef} className="absolute inset-0" />
      <TerminalStatusOverlay connectionState={connectionState} />
    </div>
  );
}

function TerminalSessionRenderer(props: TerminalSessionRendererProps) {
  if (props.renderer === "ghostty") {
    return <GhosttyTaskRunTerminalSession {...props} />;
  }

  return <XTermTaskRunTerminalSession {...props} />;
}

export function TaskRunTerminalSession(props: TaskRunTerminalSessionProps) {
  const renderer = getTerminalRenderer();
  return <TerminalSessionRenderer {...props} renderer={renderer} />;
}
