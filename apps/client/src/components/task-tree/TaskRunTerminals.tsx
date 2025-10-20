import { createTerminalOptions } from "@cmux/shared/terminal-config";
import { extractMorphInstanceInfo } from "@cmux/shared";
import type { Doc } from "@cmux/convex/dataModel";
import { FitAddon } from "@xterm/addon-fit";
import { AttachAddon } from "@xterm/addon-attach";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import clsx from "clsx";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryResult,
} from "@tanstack/react-query";
import { Loader2, Plus, X } from "lucide-react";

const XTERM_PORT = 39383;

interface TaskRunTerminalsProps {
  vscodeInfo: Doc<"taskRuns">["vscode"] | null | undefined;
  indentLevel: number;
}

type ConnectionState =
  | "idle"
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

interface XtermServer {
  origin: string;
}

interface XTermSessionProps {
  baseOrigin: string;
  terminalId: string;
  isActive: boolean;
  onConnectionChange?: (id: string, state: ConnectionState) => void;
}

interface ResizeDimensions {
  cols: number;
  rows: number;
}

function normalizedDimensions(cols: number, rows: number): ResizeDimensions {
  const safeCols = Number.isFinite(cols) && cols > 0 ? cols : 80;
  const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 24;
  return {
    cols: Math.max(20, Math.min(320, Math.round(safeCols))),
    rows: Math.max(8, Math.min(120, Math.round(safeRows))),
  };
}

function buildProxyHostname(hostname: string, port: number): string | null {
  const firstDotIndex = hostname.indexOf(".");
  if (firstDotIndex === -1) {
    return null;
  }
  const subdomain = hostname.slice(0, firstDotIndex);
  const suffix = hostname.slice(firstDotIndex + 1);
  const segments = subdomain.split("-");
  if (segments.length < 4 || segments[0] !== "cmux") {
    return null;
  }
  const nextSegments = [...segments.slice(0, -1), String(port)];
  return `${nextSegments.join("-")}.${suffix}`;
}

function buildCmuxPortHostname(hostname: string, port: number): string | null {
  const firstDotIndex = hostname.indexOf(".");
  if (firstDotIndex === -1) {
    return null;
  }
  const subdomain = hostname.slice(0, firstDotIndex);
  const suffix = hostname.slice(firstDotIndex + 1);
  if (!subdomain.startsWith("port-")) {
    return null;
  }
  const segments = subdomain.split("-");
  if (segments.length < 3) {
    return null;
  }
  const nextSegments = ["port", String(port), ...segments.slice(2)];
  return `${nextSegments.join("-")}.${suffix}`;
}

function resolveXtermServer(
  vscodeInfo: Doc<"taskRuns">["vscode"] | null | undefined
): XtermServer | null {
  if (!vscodeInfo) {
    return null;
  }

  if (vscodeInfo.provider !== "morph") {
    return null;
  }

  const rawUrl = vscodeInfo.workspaceUrl ?? vscodeInfo.url;
  if (!rawUrl) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const info = extractMorphInstanceInfo(url);
  if (!info) {
    return null;
  }

  const protocol = url.protocol === "http:" ? "http:" : "https:";
  let hostname: string | null = null;

  switch (info.source) {
    case "http-cloud":
      hostname = `port-${XTERM_PORT}-morphvm-${info.morphId}.http.cloud.morph.so`;
      break;
    case "cmux-proxy":
      hostname = buildProxyHostname(info.hostname, XTERM_PORT);
      break;
    case "cmux-port":
      hostname = buildCmuxPortHostname(info.hostname, XTERM_PORT);
      break;
    default:
      hostname = null;
  }

  if (!hostname) {
    return null;
  }

  return {
    origin: `${protocol}//${hostname}`,
  };
}

async function fetchTerminalIds(origin: string): Promise<string[]> {
  const response = await fetch(new URL("/api/tabs", origin), {
    method: "GET",
  });

  if (!response.ok) {
    throw new Error(`Failed to load terminals (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("Invalid terminals payload");
  }

  return payload
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      return String(value);
    })
    .filter((value) => value.length > 0);
}

async function createTerminal(origin: string): Promise<string> {
  const response = await fetch(new URL("/api/tabs", origin), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ cols: 80, rows: 24 }),
  });

  if (!response.ok) {
    throw new Error(`Failed to create terminal (${response.status})`);
  }

  const payload: unknown = await response.json();
  if (
    !payload ||
    typeof payload !== "object" ||
    !("id" in payload) ||
    typeof (payload as { id: unknown }).id !== "string"
  ) {
    throw new Error("Invalid create terminal response");
  }

  return (payload as { id: string }).id;
}

async function deleteTerminal(origin: string, terminalId: string): Promise<void> {
  const response = await fetch(new URL(`/api/tabs/${terminalId}`, origin), {
    method: "DELETE",
  });

  if (!response.ok && response.status !== 404) {
    throw new Error(`Failed to delete terminal (${response.status})`);
  }
}

function useTerminalTabs(
  origin: string | null
): UseQueryResult<string[], Error> {
  return useQuery({
    queryKey: ["xterm-tabs", origin],
    enabled: Boolean(origin),
    queryFn: () => fetchTerminalIds(origin ?? ""),
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
}

function statusLabel(state: ConnectionState): string {
  switch (state) {
    case "connecting":
      return "Connecting";
    case "connected":
      return "Connected";
    case "disconnected":
      return "Disconnected";
    case "error":
      return "Error";
    default:
      return "Idle";
  }
}

export function TaskRunTerminals({
  vscodeInfo,
  indentLevel,
}: TaskRunTerminalsProps) {
  const server = useMemo(() => resolveXtermServer(vscodeInfo), [vscodeInfo]);
  const origin = server?.origin ?? null;

  const queryClient = useQueryClient();
  const terminalTabs = useTerminalTabs(origin);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    "idle"
  );

  useEffect(() => {
    if (!origin) {
      setActiveId(null);
      setConnectionState("idle");
    }
  }, [origin]);

  useEffect(() => {
    const ids = terminalTabs.data;
    if (!ids || ids.length === 0) {
      setActiveId((current) => {
        if (current !== null) {
          setConnectionState("idle");
        }
        return null;
      });
      return;
    }
    setActiveId((current) => {
      const next = current && ids.includes(current) ? current : ids[0] ?? null;
      if (next !== current) {
        setConnectionState(next ? "connecting" : "idle");
      }
      return next;
    });
  }, [terminalTabs.data]);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!origin) {
        throw new Error("Xterm server unavailable");
      }
      return createTerminal(origin);
    },
    onSuccess: async (id) => {
      setConnectionState("connecting");
      await queryClient.invalidateQueries({
        queryKey: ["xterm-tabs", origin],
      });
      setActiveId(id);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (!origin) {
        throw new Error("Xterm server unavailable");
      }
      await deleteTerminal(origin, id);
    },
    onSuccess: async (_, id) => {
      await queryClient.invalidateQueries({
        queryKey: ["xterm-tabs", origin],
      });
      setActiveId((current) => {
        if (current === id) {
          setConnectionState("idle");
          return null;
        }
        return current;
      });
    },
  });

  const handleConnectionChange = useCallback(
    (id: string, state: ConnectionState) => {
      if (id === activeId) {
        setConnectionState(state);
      }
    },
    [activeId]
  );

  const indentPadding = 24 + indentLevel * 8;

  if (!origin) {
    return null;
  }

  return (
    <div
      className="mt-1 text-xs"
      style={{ paddingLeft: `${indentPadding}px` }}
      data-testid="task-run-terminals"
    >
      <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        <span>Terminals</span>
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-md border border-neutral-300 dark:border-neutral-700 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-neutral-700/60 disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={() => createMutation.mutate()}
          disabled={createMutation.isPending}
        >
          {createMutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Plus className="h-3 w-3" />
          )}
          New
        </button>
      </div>
      <div className="mt-1 rounded-md border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        {terminalTabs.isLoading ? (
          <div className="flex h-40 items-center justify-center text-neutral-500 dark:text-neutral-400">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading terminals…
          </div>
        ) : terminalTabs.isError ? (
          <div className="flex h-40 items-center justify-center px-4 text-center text-neutral-500 dark:text-neutral-400">
            Failed to load terminals: {terminalTabs.error?.message ?? "Unknown error"}
          </div>
        ) : terminalTabs.data && terminalTabs.data.length > 0 ? (
          <div className="flex flex-col">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-neutral-200 px-2 py-1 text-[11px] dark:border-neutral-800">
              {terminalTabs.data.map((id) => {
                const isActive = id === activeId;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() =>
                      setActiveId((current) => {
                        if (current === id) {
                          return current;
                        }
                        setConnectionState("connecting");
                        return id;
                      })
                    }
                    className={clsx(
                      "group inline-flex items-center gap-1 rounded px-2 py-1 transition",
                      isActive
                        ? "bg-neutral-200 text-neutral-800 dark:bg-neutral-700 dark:text-neutral-100"
                        : "text-neutral-500 hover:bg-neutral-200/80 dark:text-neutral-400 dark:hover:bg-neutral-700/70"
                    )}
                  >
                    <span className="font-mono">{id.slice(0, 8)}</span>
                    <button
                      type="button"
                      className="rounded p-0.5 text-neutral-500 hover:bg-neutral-300/70 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-600/70 dark:hover:text-neutral-100"
                      onClick={(event) => {
                        event.stopPropagation();
                        deleteMutation.mutate(id);
                      }}
                      aria-label={`Close terminal ${id}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </button>
                );
              })}
            </div>
            <div className="relative h-48">
              {terminalTabs.data.map((id) => (
                <XTermSession
                  key={id}
                  baseOrigin={origin}
                  terminalId={id}
                  isActive={id === activeId}
                  onConnectionChange={handleConnectionChange}
                />
              ))}
              <div className="pointer-events-none absolute bottom-2 right-3 text-[10px] uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
                {statusLabel(connectionState)}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex h-40 flex-col items-center justify-center gap-2 px-4 text-center text-neutral-500 dark:text-neutral-400">
            <p>No terminals yet.</p>
            <button
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-neutral-300 px-2 py-1 text-[11px] font-medium text-neutral-600 hover:bg-neutral-200/70 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-700/60"
              onClick={() => createMutation.mutate()}
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              Start terminal
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function XTermSession({
  baseOrigin,
  terminalId,
  isActive,
  onConnectionChange,
}: XTermSessionProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingResizeRef = useRef<ResizeDimensions | null>(null);
  const closingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    []
  );

  const setConnectionState = useCallback(
    (state: ConnectionState) => {
      if (onConnectionChange && mountedRef.current) {
        onConnectionChange(terminalId, state);
      }
    },
    [onConnectionChange, terminalId]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const terminal = new Terminal(
      createTerminalOptions({
        cursorBlink: true,
        scrollback: 8000,
      })
    );
    terminalRef.current = terminal;

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();
    fitAddonRef.current = fitAddon;

    terminal.loadAddon(fitAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(unicodeAddon);
    unicodeAddon.activate(terminal);

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch {
      webglAddon = null;
    }

    terminal.open(container);

    const socketUrl = new URL(`/ws/${terminalId}`, baseOrigin);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";

    const socket = new WebSocket(socketUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    const attachAddon = new AttachAddon(socket, { bidirectional: true });
    attachAddonRef.current = attachAddon;
    terminal.loadAddon(attachAddon);

    const flushResize = () => {
      if (!pendingResizeRef.current) {
        return;
      }
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        return;
      }
      const next = pendingResizeRef.current;
      socketRef.current.send(
        JSON.stringify({ type: "resize", cols: next.cols, rows: next.rows })
      );
      pendingResizeRef.current = null;
    };

    const measureAndResize = () => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }
      fitAddonRef.current.fit();
      const dims = normalizedDimensions(
        terminalRef.current.cols,
        terminalRef.current.rows
      );
      if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
        pendingResizeRef.current = dims;
        return;
      }
      socketRef.current.send(
        JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
      );
    };

    const resizeObserver = new ResizeObserver(() => {
      window.requestAnimationFrame(() => measureAndResize());
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    const handleWindowResize = () => measureAndResize();
    window.addEventListener("resize", handleWindowResize);

    const handleOpen = () => {
      setConnectionState("connected");
      measureAndResize();
      flushResize();
      window.requestAnimationFrame(() => {
        fitAddon.fit();
        terminal.focus();
      });
    };

    const handleClose = () => {
      socketRef.current = null;
      attachAddonRef.current?.dispose();
      attachAddonRef.current = null;
      if (!closingRef.current) {
        setConnectionState("disconnected");
      }
    };

    const handleError = () => {
      if (!closingRef.current) {
        setConnectionState("error");
      }
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);

    setConnectionState("connecting");

    return () => {
      closingRef.current = true;
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
      resizeObserverRef.current = null;

      attachAddon.dispose();
      attachAddonRef.current = null;

      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      socketRef.current = null;

      if (webglAddon) {
        try {
          webglAddon.dispose();
        } catch {
          // Ignore cleanup failures
        }
      }

      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      setConnectionState("idle");
    };
  }, [baseOrigin, terminalId, setConnectionState]);

  useEffect(() => {
    if (isActive && terminalRef.current) {
      window.requestAnimationFrame(() => {
        fitAddonRef.current?.fit();
        terminalRef.current?.focus();
      });
    }
  }, [isActive]);

  return (
    <div
      className={clsx(
        "absolute inset-0 overflow-hidden rounded-b-md border-t border-neutral-200 bg-neutral-950 text-neutral-50 dark:border-neutral-800",
        isActive ? "opacity-100" : "pointer-events-none opacity-0"
      )}
    >
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}
