import { createTerminalOptions } from "@cmux/shared/terminal-config";
import type { AnnotatedTaskRun } from "@/types/task";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { FitAddon } from "@xterm/addon-fit";
import { AttachAddon } from "@xterm/addon-attach";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { Terminal } from "@xterm/xterm";
import { toMorphServiceBaseUrl } from "@/lib/toProxyWorkspaceUrl";

const TERMINAL_PORT = 39383;
const DEFAULT_COLS = 120;
const DEFAULT_ROWS = 32;

interface TaskRunTerminalsProps {
  run: AnnotatedTaskRun;
  teamSlugOrId: string;
  indentPx: number;
}

type TerminalStatus = "connecting" | "connected" | "disconnected" | "error";

export function TaskRunTerminals({
  run,
  teamSlugOrId,
  indentPx,
}: TaskRunTerminalsProps) {
  const baseUrl = useMemo(() => {
    const workspaceUrl = run.vscode?.workspaceUrl ?? run.vscode?.url;
    if (!workspaceUrl) {
      return null;
    }
    return toMorphServiceBaseUrl(workspaceUrl, TERMINAL_PORT);
  }, [run.vscode?.workspaceUrl, run.vscode?.url]);

  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["taskRunTerminals", teamSlugOrId, run._id, baseUrl] as const,
    [teamSlugOrId, run._id, baseUrl],
  );

  const { data: tabIds = [], isLoading, isError, error, isFetching } = useQuery<string[]>(
    {
      queryKey,
      queryFn: async () => {
        if (!baseUrl) {
          return [];
        }
        const url = new URL("/api/tabs", baseUrl);
        const response = await fetch(url.toString(), {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error(`Failed to load terminals (${response.status})`);
        }
        const payload = (await response.json()) as string[];
        return payload.filter((item) => typeof item === "string");
      },
      enabled: Boolean(baseUrl),
      refetchInterval: 15_000,
      staleTime: 10_000,
    },
  );

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  useEffect(() => {
    setActiveTabId((current) => {
      if (tabIds.length === 0) {
        return null;
      }
      if (current && tabIds.includes(current)) {
        return current;
      }
      return tabIds[0];
    });
  }, [tabIds]);

  const [isCreating, setIsCreating] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);

  const handleCreateTerminal = useCallback(async () => {
    if (!baseUrl) {
      return;
    }
    setIsCreating(true);
    setRequestError(null);
    try {
      const url = new URL("/api/tabs", baseUrl);
      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cols: DEFAULT_COLS, rows: DEFAULT_ROWS }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create terminal (${response.status})`);
      }
      const payload = (await response.json()) as { id: string | undefined };
      await queryClient.invalidateQueries({ queryKey, exact: true });
      if (payload.id) {
        setActiveTabId(payload.id);
      }
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : "Unable to create terminal",
      );
    } finally {
      setIsCreating(false);
    }
  }, [baseUrl, queryClient, queryKey]);

  const handleCloseTerminal = useCallback(
    async (terminalId: string) => {
      if (!baseUrl) {
        return;
      }
      setRequestError(null);
      try {
        const url = new URL(`/api/tabs/${terminalId}`, baseUrl);
        const response = await fetch(url.toString(), {
          method: "DELETE",
          credentials: "include",
        });
        if (!response.ok && response.status !== 404) {
          throw new Error(`Failed to close terminal (${response.status})`);
        }
        await queryClient.invalidateQueries({ queryKey, exact: true });
      } catch (err) {
        setRequestError(
          err instanceof Error ? err.message : "Unable to close terminal",
        );
      }
    },
    [baseUrl, queryClient, queryKey],
  );


  const [statuses, setStatuses] = useState<Record<string, TerminalStatus>>({});
  useEffect(() => {
    setStatuses((prev) => {
      const next: Record<string, TerminalStatus> = {};
      for (const id of tabIds) {
        if (prev[id]) {
          next[id] = prev[id];
        }
      }
      return next;
    });
  }, [tabIds]);

  const handleStatusChange = useCallback((id: string, status: TerminalStatus) => {
    setStatuses((prev) => {
      if (prev[id] === status) {
        return prev;
      }
      return { ...prev, [id]: status };
    });
  }, []);

  if (!baseUrl) {
    return (
      <div
        style={{ paddingLeft: `${indentPx}px` }}
        className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-1"
      >
        Terminals are available for Morph-hosted workspaces.
      </div>
    );
  }

  return (
    <div style={{ paddingLeft: `${indentPx}px` }} className="mt-1.5">
      <div className="rounded-md border border-neutral-200/70 dark:border-neutral-800/60 bg-neutral-100/40 dark:bg-neutral-900/40">
        <div className="flex items-center justify-between px-2 py-1.5">
          <span className="text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Terminals
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              className="px-2 py-0.5 text-[11px] rounded border border-neutral-300 dark:border-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/60 dark:hover:bg-neutral-800/60 disabled:opacity-60 disabled:pointer-events-none"
              onClick={handleCreateTerminal}
              disabled={isCreating}
            >
              {isCreating ? "Starting…" : "New"}
            </button>
          </div>
        </div>
        <div className="px-2 pb-2">
          <div className="flex flex-wrap items-center gap-1 mb-2">
            {tabIds.map((id, index) => {
              const isActive = id === activeTabId;
              const status = statuses[id] ?? "connecting";
              return (
                <div key={id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setActiveTabId(id)}
                    className={clsx(
                      "px-2 py-0.5 text-[11px] rounded transition-colors",
                      "border border-transparent",
                      isActive
                        ? "bg-neutral-200 dark:bg-neutral-800 text-neutral-900 dark:text-neutral-100"
                        : "bg-neutral-100/70 dark:bg-neutral-900/70 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-neutral-800/80",
                    )}
                  >
                    <span className="mr-1">Tab {index + 1}</span>
                    <span
                      className={clsx(
                        "inline-block h-2 w-2 rounded-full",
                        status === "connected"
                          ? "bg-emerald-500"
                          : status === "error"
                            ? "bg-red-500"
                            : "bg-amber-500",
                      )}
                    />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCloseTerminal(id)}
                    className="px-1 text-[10px] text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                    aria-label={`Close terminal ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              );
            })}
            {tabIds.length === 0 && !isLoading ? (
              <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                No terminals yet. Start one to connect.
              </span>
            ) : null}
          </div>
          <div className="relative h-56 rounded-md border border-neutral-200/70 dark:border-neutral-800/60 overflow-hidden bg-neutral-950">
            {tabIds.map((id) => (
              <TerminalTab
                key={id}
                baseUrl={baseUrl}
                terminalId={id}
                isActive={activeTabId === id}
                onStatusChange={(status) => handleStatusChange(id, status)}
              />
            ))}
            {tabIds.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-neutral-400">
                {isLoading || isFetching ? "Loading terminals…" : "Create a terminal to get started."}
              </div>
            ) : null}
          </div>
          {requestError ? (
            <div className="mt-2 text-[11px] text-red-500">
              {requestError}
            </div>
          ) : null}
          {isError && error ? (
            <div className="mt-2 text-[11px] text-red-500">
              {error instanceof Error
                ? error.message
                : "Unable to load terminals"}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface TerminalTabProps {
  baseUrl: string;
  terminalId: string;
  isActive: boolean;
  onStatusChange?: (status: TerminalStatus) => void;
}

function TerminalTab({
  baseUrl,
  terminalId,
  isActive,
  onStatusChange,
}: TerminalTabProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const attachAddonRef = useRef<AttachAddon | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const updateSizeRef = useRef<(() => void) | null>(null);
  const isActiveRef = useRef(isActive);
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [errorText, setErrorText] = useState<string | null>(null);

  const setStatusSafe = useCallback(
    (nextStatus: TerminalStatus, nextError: string | null = null) => {
      setStatus(nextStatus);
      setErrorText(nextError);
      onStatusChange?.(nextStatus);
    },
    [onStatusChange],
  );

  useEffect(() => {
    isActiveRef.current = isActive;
    if (isActive) {
      updateSizeRef.current?.();
      terminalRef.current?.focus();
    }
  }, [isActive]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let disposed = false;

    setStatusSafe("connecting");
    setErrorText(null);

    const terminal = new Terminal(
      createTerminalOptions({
        cursorBlink: true,
        scrollback: 100000,
      }),
    );
    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();
    const searchAddon = new SearchAddon();
    const unicodeAddon = new Unicode11Addon();

    terminal.loadAddon(unicodeAddon);
    terminal.loadAddon(searchAddon);
    terminal.loadAddon(webLinksAddon);
    terminal.loadAddon(fitAddon);

    let webglAddon: WebglAddon | null = null;
    try {
      webglAddon = new WebglAddon();
      terminal.loadAddon(webglAddon);
    } catch (err) {
      console.debug("[TaskRunTerminals] WebGL addon unavailable", err);
    }

    terminal.open(container);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const updateSize = () => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }
      fitAddonRef.current.fit();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        const cols = terminalRef.current.cols;
        const rows = terminalRef.current.rows;
        socketRef.current.send(
          JSON.stringify({ type: "resize", cols, rows }),
        );
      }
    };
    updateSizeRef.current = updateSize;

    const resizeObserver = new ResizeObserver(() => {
      if (!isActiveRef.current) {
        return;
      }
      updateSize();
    });
    resizeObserver.observe(container);
    resizeObserverRef.current = resizeObserver;

    const handleWindowResize = () => {
      if (!isActiveRef.current) {
        return;
      }
      updateSize();
    };
    window.addEventListener("resize", handleWindowResize);

    const wsUrl = new URL(`/ws/${terminalId}`, baseUrl);
    wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
    const socket = new WebSocket(wsUrl);
    socket.binaryType = "arraybuffer";
    socketRef.current = socket;

    const attachAddon = new AttachAddon(socket, { bidirectional: true });
    terminal.loadAddon(attachAddon);
    attachAddonRef.current = attachAddon;

    const handleOpen = () => {
      if (disposed) {
        return;
      }
      setStatusSafe("connected");
      updateSize();
      window.requestAnimationFrame(() => updateSize());
      if (isActiveRef.current) {
        terminal.focus();
      }
    };

    const handleClose = () => {
      if (disposed) {
        return;
      }
      setStatusSafe("disconnected");
    };

    const handleError = () => {
      if (disposed) {
        return;
      }
      setStatusSafe("error", "Connection error");
    };

    socket.addEventListener("open", handleOpen);
    socket.addEventListener("close", handleClose);
    socket.addEventListener("error", handleError);

    return () => {
      disposed = true;
      socket.removeEventListener("open", handleOpen);
      socket.removeEventListener("close", handleClose);
      socket.removeEventListener("error", handleError);
      window.removeEventListener("resize", handleWindowResize);
      resizeObserver.disconnect();
      resizeObserverRef.current = null;
      attachAddon.dispose();
      attachAddonRef.current = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
      socketRef.current = null;
      updateSizeRef.current = null;
      fitAddonRef.current = null;
      terminal.dispose();
      terminalRef.current = null;
      if (webglAddon) {
        webglAddon.dispose();
      }
    };
  }, [baseUrl, terminalId, setStatusSafe]);

  const showOverlay = status !== "connected";
  const overlayText =
    status === "connecting"
      ? "Connecting to terminal…"
      : status === "disconnected"
        ? "Terminal disconnected"
        : "Connection error";

  return (
    <div
      className={clsx(
        "absolute inset-0",
        "transition-opacity duration-150",
        isActive
          ? "opacity-100 pointer-events-auto"
          : "opacity-0 pointer-events-none",
      )}
      aria-hidden={!isActive}
    >
      <div ref={containerRef} className="h-full w-full" />
      {showOverlay ? (
        <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/80 text-[11px] text-neutral-200">
          <span>{errorText ?? overlayText}</span>
        </div>
      ) : null}
    </div>
  );
}
