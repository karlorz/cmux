import { AttachAddon } from "@xterm/addon-attach";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Unicode11Addon } from "@xterm/addon-unicode11";
import { WebglAddon } from "@xterm/addon-webgl";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { createTerminalOptions } from "@cmux/shared/terminal-config";
import { Plus, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";

interface TerminalSession {
  id: string;
  terminal: Terminal;
  fitAddon: FitAddon;
  socket: WebSocket | null;
  attachAddon: AttachAddon | null;
  resizeObserver: ResizeObserver | null;
}

interface XTerminalTabsProps {
  baseUrl?: string;
}

export const XTerminalTabs: FC<XTerminalTabsProps> = ({
  baseUrl = "http://localhost:39383",
}) => {
  const [sessions, setSessions] = useState<Map<string, TerminalSession>>(
    new Map()
  );
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRefsMap = useRef<Map<string, HTMLDivElement>>(new Map());
  // Track which terminals have been initialized to avoid double initialization
  const initializedTerminals = useRef<Set<string>>(new Set());

  // Create a new terminal session
  const createTerminal = useCallback(async () => {
    if (isCreating) return;
    setIsCreating(true);

    try {
      // Calculate terminal dimensions
      const cols = 80;
      const rows = 24;

      // Create terminal on backend
      const response = await fetch(`${baseUrl}/api/tabs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cols, rows }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create terminal: ${response.status}`);
      }

      const { id } = await response.json();

      // Terminal will be initialized in the effect when the DOM element is ready
      setActiveTabId(id);
    } catch (error) {
      console.error("Failed to create terminal:", error);
    } finally {
      setIsCreating(false);
    }
  }, [baseUrl, isCreating]);

  // Initialize a terminal instance
  const initializeTerminal = useCallback(
    (id: string, element: HTMLDivElement) => {
      // Prevent double initialization
      if (initializedTerminals.current.has(id)) {
        return;
      }
      initializedTerminals.current.add(id);

      const terminal = new Terminal(
        createTerminalOptions({
          allowProposedApi: true,
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: 14,
          cursorBlink: true,
          scrollback: 8000,
          theme: {
            background: "#0f172a",
            foreground: "#e2e8f0",
            cursor: "#38bdf8",
            selectionForeground: "#0f172a",
            selectionBackground: "rgba(56, 189, 248, 0.4)",
          },
        })
      );

      const fitAddon = new FitAddon();
      const webLinksAddon = new WebLinksAddon();
      const searchAddon = new SearchAddon();
      const unicodeAddon = new Unicode11Addon();

      terminal.loadAddon(fitAddon);
      terminal.loadAddon(webLinksAddon);
      terminal.loadAddon(searchAddon);
      terminal.loadAddon(unicodeAddon);
      unicodeAddon.activate(terminal);

      terminal.open(element);

      // Try to load WebGL addon (optional)
      try {
        const webglAddon = new WebglAddon();
        terminal.loadAddon(webglAddon);
        webglAddon.onContextLoss(() => {
          webglAddon.dispose();
        });
      } catch {
        // WebGL not supported, fallback to canvas
      }

      fitAddon.fit();

      // Connect to WebSocket
      const wsUrl = new URL(`/ws/${id}`, baseUrl);
      wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";

      const socket = new WebSocket(wsUrl.toString());
      socket.binaryType = "arraybuffer";

      const attachAddon = new AttachAddon(socket, { bidirectional: true });
      terminal.loadAddon(attachAddon);

      socket.addEventListener("open", () => {
        terminal.focus();
        fitAddon.fit();
        // Send initial resize
        const dims = normalizedDimensions(terminal.cols, terminal.rows);
        socket.send(
          JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows })
        );
      });

      socket.addEventListener("error", (event) => {
        console.error("WebSocket error for terminal", id, event);
      });

      socket.addEventListener("close", () => {
        console.log("WebSocket closed for terminal", id);
      });

      // Setup resize observer
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        if (socket.readyState === WebSocket.OPEN) {
          const dims = normalizedDimensions(terminal.cols, terminal.rows);
          socket.send(
            JSON.stringify({
              type: "resize",
              cols: dims.cols,
              rows: dims.rows,
            })
          );
        }
      });
      resizeObserver.observe(element);

      const session: TerminalSession = {
        id,
        terminal,
        fitAddon,
        socket,
        attachAddon,
        resizeObserver,
      };

      setSessions((prev) => new Map(prev).set(id, session));
    },
    [baseUrl]
  );

  // Close terminal session
  const closeTerminal = useCallback(
    async (id: string) => {
      const session = sessions.get(id);
      if (!session) return;

      // Cleanup
      session.resizeObserver?.disconnect();
      session.attachAddon?.dispose();
      if (session.socket && session.socket.readyState === WebSocket.OPEN) {
        session.socket.close();
      }
      session.terminal.dispose();
      initializedTerminals.current.delete(id);

      // Remove from map
      setSessions((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });

      // Delete from backend
      try {
        await fetch(`${baseUrl}/api/tabs/${id}`, { method: "DELETE" });
      } catch (error) {
        console.error("Failed to delete terminal:", error);
      }

      // Switch to another tab if this was active
      if (activeTabId === id) {
        const remainingIds = Array.from(sessions.keys()).filter(
          (sid) => sid !== id
        );
        setActiveTabId(remainingIds.length > 0 ? remainingIds[0] : null);
      }
    },
    [sessions, activeTabId, baseUrl]
  );

  // Effect to initialize terminals when their DOM elements are ready
  useEffect(() => {
    if (!activeTabId) return;

    const element = terminalRefsMap.current.get(activeTabId);
    if (!element) return;

    // Only initialize if not already initialized
    if (!sessions.has(activeTabId)) {
      initializeTerminal(activeTabId, element);
    } else {
      // Focus existing terminal
      const session = sessions.get(activeTabId);
      if (session) {
        session.terminal.focus();
        session.fitAddon.fit();
      }
    }
  }, [activeTabId, sessions, initializeTerminal]);

  // Cleanup all terminals on unmount
  useEffect(() => {
    return () => {
      sessions.forEach((session) => {
        session.resizeObserver?.disconnect();
        session.attachAddon?.dispose();
        if (session.socket && session.socket.readyState === WebSocket.OPEN) {
          session.socket.close();
        }
        session.terminal.dispose();
      });
      initializedTerminals.current.clear();
    };
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      sessions.forEach((session) => {
        session.fitAddon.fit();
      });
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [sessions]);

  const sessionIds = useMemo(() => Array.from(sessions.keys()), [sessions]);

  return (
    <div className="flex flex-col h-full bg-neutral-50 dark:bg-neutral-900">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-2 bg-neutral-100 dark:bg-neutral-800 border-b border-neutral-200 dark:border-neutral-700">
        {sessionIds.map((id) => (
          <button
            key={id}
            onClick={() => setActiveTabId(id)}
            className={clsx(
              "flex items-center gap-2 px-3 py-1.5 rounded text-sm transition-colors",
              activeTabId === id
                ? "bg-neutral-50 dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100"
                : "bg-transparent text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-700"
            )}
          >
            <span>Terminal {id.slice(0, 8)}</span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTerminal(id);
              }}
              className="hover:bg-neutral-300 dark:hover:bg-neutral-600 rounded p-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </button>
        ))}
        <button
          onClick={createTerminal}
          disabled={isCreating}
          className="flex items-center gap-1 px-3 py-1.5 rounded text-sm bg-neutral-200 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-600 transition-colors disabled:opacity-50"
        >
          <Plus className="w-3 h-3" />
          New
        </button>
      </div>

      {/* Terminal container */}
      <div ref={containerRef} className="flex-1 relative">
        {activeTabId ? (
          <div
            key={activeTabId}
            ref={(el) => {
              if (el) {
                terminalRefsMap.current.set(activeTabId, el);
              }
            }}
            className="absolute inset-0"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400">
            <div className="text-center">
              <p className="mb-2">No terminals open</p>
              <button
                onClick={createTerminal}
                className="px-4 py-2 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
              >
                Create Terminal
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper function to normalize dimensions
function normalizedDimensions(cols: number, rows: number) {
  const safeCols = Number.isFinite(cols) && cols > 0 ? cols : 80;
  const safeRows = Number.isFinite(rows) && rows > 0 ? rows : 24;
  return {
    cols: Math.max(20, Math.min(320, Math.round(safeCols))),
    rows: Math.max(8, Math.min(120, Math.round(safeRows))),
  };
}
