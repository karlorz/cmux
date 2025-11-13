import { Buffer } from "node:buffer";
import { serverLogger } from "./fileLogger";
import { stackServerApp } from "./stackServerApp";

type StackTokens = {
  accessToken?: string | null;
  refreshToken?: string | null;
};

export interface AuthTokenSource {
  getAccessToken(): string | undefined;
  getAuthHeaderJson(): string | undefined;
}

export interface StackAuthSnapshot {
  token?: string;
  authJson?: string;
}

const REFRESH_SKEW_MS = 60_000;
const FALLBACK_REFRESH_MS = 5 * 60_000;
const MIN_REFRESH_DELAY_MS = 5_000;
const RETRY_DELAY_MS = 30_000;

export class StackAuthState implements AuthTokenSource {
  private accessToken?: string;
  private refreshToken?: string;
  private authJson?: string;
  private refreshTimer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private inflightRefresh: Promise<void> | null = null;
  private readonly label: string;
  private readonly logger = serverLogger;

  constructor(params: {
    initialAccessToken?: string;
    initialAuthJson?: string;
    label?: string;
  }) {
    const parsed = parseAuthJson(params.initialAuthJson);
    this.accessToken = parsed?.accessToken ?? params.initialAccessToken;
    this.refreshToken = parsed?.refreshToken ?? undefined;
    this.label = params.label ?? "socket";
    this.updateAuthJson();
    if (!this.refreshToken) {
      this.logger.info(
        `[StackAuth] (${this.label}) No refresh token provided; relying on client reconnects`
      );
    }
  }

  start(): void {
    this.scheduleRefresh("start");
  }

  stop(): void {
    this.stopped = true;
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = undefined;
    }
  }

  getSnapshot(): StackAuthSnapshot {
    return {
      token: this.getAccessToken(),
      authJson: this.getAuthHeaderJson(),
    };
  }

  getAccessToken(): string | undefined {
    return this.accessToken ?? undefined;
  }

  getAuthHeaderJson(): string | undefined {
    return this.authJson;
  }

  private updateAuthJson(): void {
    const payload: Record<string, string> = {};
    if (this.accessToken) payload.accessToken = this.accessToken;
    if (this.refreshToken) payload.refreshToken = this.refreshToken;
    this.authJson =
      Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined;
  }

  private scheduleRefresh(reason: string, overrideDelayMs?: number): void {
    if (this.stopped || !this.refreshToken) return;
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    const delayMs = overrideDelayMs ?? this.computeRefreshDelay();
    this.refreshTimer = setTimeout(() => {
      void this.refreshTokens(`auto:${reason}`);
    }, Math.max(delayMs, MIN_REFRESH_DELAY_MS));
  }

  private computeRefreshDelay(): number {
    const expSeconds = decodeJwtExp(this.accessToken);
    if (!expSeconds) {
      return FALLBACK_REFRESH_MS;
    }
    const targetMs = expSeconds * 1000 - REFRESH_SKEW_MS;
    return targetMs - Date.now();
  }

  async refreshTokens(reason: string): Promise<void> {
    if (this.stopped || !this.refreshToken) return;
    if (this.inflightRefresh) {
      return this.inflightRefresh;
    }

    this.inflightRefresh = (async () => {
      try {
        this.logger.debug(
          `[StackAuth] (${this.label}) refreshing tokens (reason=${reason})`
        );
        const fresh = await this.fetchFreshTokens();
        if (fresh?.accessToken) {
          this.accessToken = fresh.accessToken;
          this.refreshToken = fresh.refreshToken ?? this.refreshToken;
          this.updateAuthJson();
          this.logger.debug(
            `[StackAuth] (${this.label}) refreshed tokens successfully`
          );
          this.scheduleRefresh("post-refresh");
          return;
        }
        this.logger.warn(
          `[StackAuth] (${this.label}) refresh returned no tokens`
        );
        this.scheduleRefresh("retry-empty", RETRY_DELAY_MS);
      } catch (error) {
        this.logger.error(
          `[StackAuth] (${this.label}) failed to refresh tokens`,
          error
        );
        this.scheduleRefresh("retry-error", RETRY_DELAY_MS);
      } finally {
        this.inflightRefresh = null;
      }
    })();

    return this.inflightRefresh;
  }

  private async fetchFreshTokens(): Promise<StackTokens | null> {
    const refreshToken = this.refreshToken;
    const accessToken = this.accessToken;
    if (!refreshToken || !accessToken) return null;
    const user = await stackServerApp.getUser({
      or: "return-null",
      tokenStore: {
        accessToken,
        refreshToken,
      },
    });
    if (!user) {
      this.logger.warn(
        `[StackAuth] (${this.label}) Stack user not found during refresh`
      );
      return null;
    }
    const tokens = await user.currentSession.getTokens();
    if (!tokens.accessToken) {
      this.logger.warn(
        `[StackAuth] (${this.label}) Stack returned no access token`
      );
      return null;
    }
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken ?? refreshToken,
    };
  }
}

export function createStackAuthState(params: {
  initialAccessToken?: string;
  initialAuthJson?: string;
  label?: string;
}): StackAuthState {
  return new StackAuthState(params);
}

function parseAuthJson(authJson?: string): StackTokens | null {
  if (!authJson) return null;
  try {
    const parsed = JSON.parse(authJson) as StackTokens;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const accessToken =
      typeof parsed.accessToken === "string" ? parsed.accessToken : undefined;
    const refreshToken =
      typeof parsed.refreshToken === "string" ? parsed.refreshToken : undefined;
    return { accessToken, refreshToken };
  } catch (error) {
    serverLogger.warn("[StackAuth] Failed to parse auth_json payload", error);
    return null;
  }
}

function decodeJwtExp(token?: string): number | undefined {
  if (!token) return undefined;
  const parts = token.split(".");
  if (parts.length < 2) return undefined;
  try {
    const payload = JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as { exp?: number };
    if (payload && typeof payload.exp === "number") {
      return payload.exp;
    }
  } catch (error) {
    serverLogger.warn("[StackAuth] Failed to decode JWT exp", error);
  }
  return undefined;
}
