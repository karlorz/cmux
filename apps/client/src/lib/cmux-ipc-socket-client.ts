import type { ClientToServerEvents, ServerToClientEvents } from "@cmux/shared";

type EventHandler = (...args: unknown[]) => void;

const formatRpcErrorMessage = (event: string, error: unknown): string => {
  if (error instanceof Error) {
    return `RPC '${event}' failed: ${error.message}`;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof (error as { message?: unknown }).message === "string"
  ) {
    return `RPC '${event}' failed: ${(error as { message: string }).message}`;
  }

  const fallback =
    typeof error === "string"
      ? error
      : (() => {
          try {
            return JSON.stringify(error);
          } catch {
            return String(error);
          }
        })();

  return `RPC '${event}' failed: ${fallback}`;
};

export class CmuxIpcSocketClient {
  private handlers = new Map<string, Set<EventHandler>>();
  private ipcCleanups = new Map<string, () => void>();
  public connected = false;
  public disconnected = true;
  public id = "cmux-ipc";
  private disposed = false;

  // Reconnection state
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly reconnectBaseDelayMs = 500;
  private readonly reconnectMaxDelayMs = 30000;
  private readonly maxReconnectAttempts = 10;

  constructor(private readonly query: Record<string, string>) {}

  async connect() {
    if (this.connected) return this;
    if (this.disposed) return this;

    try {
      await window.cmux.register({
        auth: this.query.auth,
        team: this.query.team,
        auth_json: this.query.auth_json,
      });
      this.connected = true;
      this.disconnected = false;
      this.reconnectAttempts = 0; // Reset on successful connection

      // Wire existing handlers to IPC events (only if not already wired)
      this.handlers.forEach((_set, event) => {
        this.ensureIpcListener(event);
      });
      this.trigger("connect");
    } catch (error) {
      console.error("[CmuxIpcSocketClient] Connection failed:", error);
      this.connected = false;
      this.disconnected = true;
      this.trigger("connect_error", error);
      this.scheduleReconnect();
    }
    return this;
  }

  private scheduleReconnect(): void {
    if (this.disposed) return;
    if (this.reconnectTimer) return;
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(
        "[CmuxIpcSocketClient] Max reconnection attempts reached"
      );
      this.trigger("reconnect_failed");
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts),
      this.reconnectMaxDelayMs
    );

    console.log(
      `[CmuxIpcSocketClient] Scheduling reconnect attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts} in ${delay}ms`
    );
    this.trigger("reconnect_attempt", this.reconnectAttempts + 1);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts += 1;
      void this.connect();
    }, delay);
  }

  /**
   * Force a reconnection attempt, resetting the attempt counter.
   * Useful for manual reconnection or after detecting a stale connection.
   */
  reconnect(): void {
    if (this.disposed) return;

    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Mark as disconnected and reset attempts
    this.connected = false;
    this.disconnected = true;
    this.reconnectAttempts = 0;

    // Trigger disconnect event if we were connected
    this.trigger("disconnect");

    // Start fresh connection
    void this.connect();
  }

  private ensureIpcListener(event: string) {
    // Skip if already registered or disposed
    if (this.ipcCleanups.has(event) || this.disposed) return;
    const cleanup = window.cmux.on(event, (...args: unknown[]) => {
      if (!this.disposed) {
        this.trigger(event, ...args);
      }
    });
    this.ipcCleanups.set(event, cleanup);
  }

  disconnect() {
    if (this.disposed) return this;
    this.disposed = true;
    this.connected = false;
    this.disconnected = true;

    // Clear any pending reconnect timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.trigger("disconnect");
    // Clean up all IPC listeners to prevent memory leaks
    for (const cleanup of this.ipcCleanups.values()) {
      try {
        cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    this.ipcCleanups.clear();
    this.handlers.clear();
    return this;
  }

  on<E extends keyof ServerToClientEvents>(
    event: E | string,
    handler: ServerToClientEvents[E] | EventHandler
  ) {
    const key = String(event);
    if (!this.handlers.has(key)) this.handlers.set(key, new Set());
    this.handlers.get(key)!.add(handler as EventHandler);
    // Subscribe to IPC if connected (deduped via ensureIpcListener)
    if (this.connected) {
      this.ensureIpcListener(key);
    }
    return this;
  }
  //window.api.cmux

  off<E extends keyof ServerToClientEvents>(
    event?: E | string,
    handler?: ServerToClientEvents[E] | EventHandler
  ) {
    if (!event) {
      this.handlers.clear();
      return this;
    }
    const key = String(event);
    if (!handler) {
      this.handlers.delete(key);
    } else {
      this.handlers.get(key)?.delete(handler as EventHandler);
    }
    return this;
  }

  emit<E extends keyof ClientToServerEvents>(
    event: E | string,
    ...args: unknown[]
  ) {
    const key = String(event);
    const last = args[args.length - 1];
    if (typeof last === "function") {
      const cb = last as (result?: unknown) => void;
      const data = args.slice(0, -1);
      window.cmux
        .rpc(key, ...data)
        .then((res: unknown) => cb(res))
        .catch((err: unknown) => {
          const message = formatRpcErrorMessage(key, err);
          console.error("[CmuxIpcSocketClient] RPC error", { event: key, err });
          cb({ error: message });
        });
    } else {
      void window.cmux.rpc(key, ...args);
    }
    return this;
  }

  private trigger(event: string, ...args: unknown[]) {
    const set = this.handlers.get(event);
    if (!set) return;
    set.forEach((fn) => fn(...args));
  }
}

// Narrow type cast to satisfy consumers expecting a Socket.IO-like API
// No additional exported types needed; consumers cast to their desired socket type.
