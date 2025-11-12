import { nativeCore } from './core';

export interface ProxyOptions {
  listenPort: number;
  enableHttp2?: boolean;
  enableWebsockets?: boolean;
  maxConnections?: number;
  idleTimeoutMs?: number;
  keepaliveMs?: number;
  headerRoutingEnabled?: boolean;
  workspaceIsolation?: boolean;
}

export interface ProxyStats {
  totalRequests: bigint;
  activeConnections: bigint;
  websocketConnections: bigint;
  http2Connections: bigint;
  bytesTransferred: bigint;
}

export class RustProxyServer {
  private started = false;

  constructor(private options: ProxyOptions) {}

  async start(): Promise<void> {
    if (this.started) {
      throw new Error('Proxy server is already running');
    }

    if (!nativeCore) {
      throw new Error('Native core module is not available');
    }

    try {
      await nativeCore.startProxyServer({
        listenPort: this.options.listenPort,
        enableHttp2: this.options.enableHttp2,
        enableWebsockets: this.options.enableWebsockets,
        maxConnections: this.options.maxConnections,
        idleTimeoutMs: this.options.idleTimeoutMs,
        keepaliveMs: this.options.keepaliveMs,
        headerRoutingEnabled: this.options.headerRoutingEnabled,
        workspaceIsolation: this.options.workspaceIsolation,
      });

      this.started = true;
      console.log(`[RustProxyServer] Started on port ${this.options.listenPort} with HTTP/2=${this.options.enableHttp2}, WebSockets=${this.options.enableWebsockets}`);
    } catch (error) {
      console.error('[RustProxyServer] Failed to start:', error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    if (!this.started) {
      throw new Error('Proxy server is not running');
    }

    if (!nativeCore) {
      throw new Error('Native core module is not available');
    }

    try {
      await nativeCore.stopProxyServer();
      this.started = false;
      console.log('[RustProxyServer] Stopped');
    } catch (error) {
      console.error('[RustProxyServer] Failed to stop:', error);
      throw error;
    }
  }

  async getStats(): Promise<ProxyStats | null> {
    if (!this.started) {
      return null;
    }

    if (!nativeCore) {
      throw new Error('Native core module is not available');
    }

    try {
      return await nativeCore.getProxyStats();
    } catch (error) {
      console.error('[RustProxyServer] Failed to get stats:', error);
      return null;
    }
  }

  isRunning(): boolean {
    return this.started;
  }
}

// Factory function to create proxy server
export function createRustProxyServer(options: ProxyOptions): RustProxyServer {
  return new RustProxyServer(options);
}