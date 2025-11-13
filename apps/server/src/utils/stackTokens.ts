import { serverLogger } from "./fileLogger";
import { getStackOAuthConfig } from "./server-env";

const STACK_API_BASE_URL =
  process.env.STACK_API_BASE_URL ?? "https://api.stack-auth.com/api/v1";
const STACK_TOKEN_ENDPOINT = `${STACK_API_BASE_URL}/auth/oauth/token`;
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 2 * 60 * 1000; // refresh 2 minutes early
const MIN_REFRESH_INTERVAL_MS = 30 * 1000;
const RETRY_DELAY_MS = 30 * 1000;
const INACTIVITY_TTL_MS = 60 * 60 * 1000; // dispose managers after 1h of inactivity

export interface StackAuthTokens {
  accessToken?: string | null;
  refreshToken?: string | null;
}

const tokenManagers = new Map<string, StackTokenManager>();

export function parseStackAuthJson(
  raw: string | string[] | null | undefined
): StackAuthTokens | null {
  if (!raw) {
    return null;
  }
  const json = Array.isArray(raw) ? raw[0] : raw;
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object") {
      return {
        accessToken:
          typeof parsed.accessToken === "string" ? parsed.accessToken : null,
        refreshToken:
          typeof parsed.refreshToken === "string"
            ? parsed.refreshToken
            : null,
      };
    }
  } catch (error) {
    serverLogger.warn("Failed to parse stack auth JSON", { error });
  }
  return null;
}

export function resolveStackTokenManager(params: {
  accessToken?: string | null;
  authJson?: string | string[] | null;
}): StackTokenManager | undefined {
  const parsed = parseStackAuthJson(params.authJson);
  const refreshToken = parsed?.refreshToken ?? null;
  const bestAccessToken =
    params.accessToken ?? parsed?.accessToken ?? undefined;

  if (!refreshToken) {
    return undefined;
  }

  let manager = tokenManagers.get(refreshToken);
  if (!manager) {
    const { projectId, publishableClientKey } = getStackOAuthConfig();
    manager = new StackTokenManager({
      refreshToken,
      initialAccessToken: bestAccessToken ?? undefined,
      projectId,
      publishableClientKey,
    });
    tokenManagers.set(refreshToken, manager);
    manager.onDispose(() => {
      const existing = tokenManagers.get(refreshToken);
      if (existing === manager) {
        tokenManagers.delete(refreshToken);
      }
    });
  } else if (bestAccessToken) {
    manager.updateAccessToken(bestAccessToken);
  }

  manager.touch();
  return manager;
}

export class StackTokenManager {
  private accessToken?: string;
  private readonly projectId: string;
  private readonly publishableClientKey: string;
  private refreshTimeout: NodeJS.Timeout | null = null;
  private retryTimeout: NodeJS.Timeout | null = null;
  private inactivityTimeout: NodeJS.Timeout | null = null;
  private refreshPromise: Promise<void> | null = null;
  private disposed = false;
  private lastUsed = Date.now();
  private headerJson?: string;
  private readonly disposeHandlers = new Set<() => void>();

  constructor(options: {
    refreshToken: string;
    initialAccessToken?: string;
    projectId: string;
    publishableClientKey: string;
  }) {
    this.refreshToken = options.refreshToken;
    this.projectId = options.projectId;
    this.publishableClientKey = options.publishableClientKey;
    this.accessToken = options.initialAccessToken;
    this.updateHeaderJson();
    this.scheduleRefresh("initial");
    this.scheduleInactivityCheck();
  }

  private refreshToken: string;

  onDispose(handler: () => void) {
    this.disposeHandlers.add(handler);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimeouts();
    for (const handler of this.disposeHandlers) {
      handler();
    }
    this.disposeHandlers.clear();
  }

  touch() {
    this.lastUsed = Date.now();
  }

  getAccessToken(): string | undefined {
    this.touch();
    return this.accessToken;
  }

  getAuthHeaderJson(): string | undefined {
    this.touch();
    return this.headerJson;
  }

  updateAccessToken(token: string) {
    if (this.accessToken === token) {
      return;
    }
    this.accessToken = token;
    this.updateHeaderJson();
    this.scheduleRefresh("access-token-update");
  }

  private updateHeaderJson() {
    const payload: Record<string, string> = {};
    if (this.accessToken) payload.accessToken = this.accessToken;
    if (this.refreshToken) payload.refreshToken = this.refreshToken;
    this.headerJson =
      Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
  }

  private scheduleRefresh(reason: string) {
    if (this.disposed) return;
    if (!this.refreshToken) return;
    this.clearRefreshTimeout();

    if (!this.accessToken) {
      this.queueRefresh(reason);
      return;
    }

    const expiresAt = getAccessTokenExpiryMs(this.accessToken);
    if (!expiresAt) {
      this.queueRefresh(`${reason}-no-exp`);
      return;
    }

    const msUntilExpiry = expiresAt - Date.now();
    const delay =
      msUntilExpiry - ACCESS_TOKEN_REFRESH_LEEWAY_MS > MIN_REFRESH_INTERVAL_MS
        ? msUntilExpiry - ACCESS_TOKEN_REFRESH_LEEWAY_MS
        : MIN_REFRESH_INTERVAL_MS;

    if (!Number.isFinite(delay) || delay <= 0) {
      this.queueRefresh(`${reason}-immediate`);
      return;
    }

    this.refreshTimeout = setTimeout(() => this.refreshNow(reason), delay);
    this.refreshTimeout.unref?.();
  }

  private queueRefresh(reason: string) {
    if (this.disposed) return;
    this.clearRefreshTimeout();
    this.refreshTimeout = setTimeout(
      () => this.refreshNow(reason),
      MIN_REFRESH_INTERVAL_MS
    );
    this.refreshTimeout.unref?.();
  }

  private scheduleRetry() {
    if (this.disposed) return;
    this.clearRetryTimeout();
    this.retryTimeout = setTimeout(
      () => this.refreshNow("retry"),
      RETRY_DELAY_MS
    );
    this.retryTimeout.unref?.();
  }

  private async refreshNow(reason: string) {
    if (this.disposed) return;
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.fetchNewAccessToken(reason)
      .catch((error) => {
        serverLogger.error("Failed to refresh Stack access token", {
          error,
          reason,
        });
        this.scheduleRetry();
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    await this.refreshPromise;
  }

  private async fetchNewAccessToken(reason: string) {
    if (!this.refreshToken) return;
    try {
      const body = new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: this.refreshToken,
        client_id: this.projectId,
        client_secret: this.publishableClientKey,
      });

      const response = await fetch(STACK_TOKEN_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      });

      if (!response.ok) {
        const text = await safeReadText(response);
        throw new Error(
          `Stack token refresh failed (${response.status}): ${text}`
        );
      }

      const data = await response.json().catch(() => null);
      const accessToken =
        data && typeof data.access_token === "string"
          ? data.access_token
          : null;
      const nextRefreshToken =
        data && typeof data.refresh_token === "string"
          ? data.refresh_token
          : null;

      if (!accessToken) {
        throw new Error("Stack token refresh response missing access token");
      }

      if (nextRefreshToken && nextRefreshToken !== this.refreshToken) {
        this.refreshToken = nextRefreshToken;
      }

      this.accessToken = accessToken;
      this.updateHeaderJson();
      this.scheduleRefresh("post-refresh");
      serverLogger.info("Stack access token refreshed", { reason });
    } catch (error) {
      throw error instanceof Error ? error : new Error(String(error));
    }
  }

  private scheduleInactivityCheck() {
    this.clearInactivityTimeout();
    this.inactivityTimeout = setTimeout(() => {
      if (this.disposed) return;
      const idleFor = Date.now() - this.lastUsed;
      if (idleFor >= INACTIVITY_TTL_MS) {
        this.dispose();
      } else {
        const remaining = Math.max(INACTIVITY_TTL_MS - idleFor, 5 * 60 * 1000);
        this.scheduleInactivityCheckWithDelay(remaining);
      }
    }, INACTIVITY_TTL_MS);
    this.inactivityTimeout.unref?.();
  }

  private scheduleInactivityCheckWithDelay(delay: number) {
    this.clearInactivityTimeout();
    this.inactivityTimeout = setTimeout(() => {
      if (this.disposed) return;
      const idleFor = Date.now() - this.lastUsed;
      if (idleFor >= INACTIVITY_TTL_MS) {
        this.dispose();
      } else {
        const remaining = Math.max(INACTIVITY_TTL_MS - idleFor, 5 * 60 * 1000);
        this.scheduleInactivityCheckWithDelay(remaining);
      }
    }, delay);
    this.inactivityTimeout.unref?.();
  }

  private clearRefreshTimeout() {
    if (this.refreshTimeout) {
      clearTimeout(this.refreshTimeout);
      this.refreshTimeout = null;
    }
  }

  private clearRetryTimeout() {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
      this.retryTimeout = null;
    }
  }

  private clearInactivityTimeout() {
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = null;
    }
  }

  private clearTimeouts() {
    this.clearRefreshTimeout();
    this.clearRetryTimeout();
    this.clearInactivityTimeout();
  }
}

function getAccessTokenExpiryMs(token?: string): number | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    );
    const exp = typeof payload?.exp === "number" ? payload.exp : null;
    return exp ? exp * 1000 : null;
  } catch {
    return null;
  }
}

async function safeReadText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 256);
  } catch {
    return "<failed to read body>";
  }
}
