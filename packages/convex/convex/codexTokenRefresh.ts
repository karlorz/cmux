import { v } from "convex/values";
import { z } from "zod";
import type { Doc } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import {
  CODEX_OAUTH_CLIENT_ID,
  CODEX_OAUTH_TOKEN_ENDPOINT,
  getCodexTokenExpiresAtMs,
  parseCodexAuthJson,
} from "@cmux/shared/providers/openai/codex-token";

const LEAD_TIME_MS = 24 * 60 * 60 * 1000;
const MAX_FAILURES = 10;

const TokenRefreshResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1).optional(),
  id_token: z.string().min(1).optional(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

type TokenRefreshResponse = z.infer<typeof TokenRefreshResponseSchema>;

function computeBackoffMs(failureCount: number): number {
  if (failureCount <= 0) return 0;
  // 5min * 2^(failureCount-1), capped at 6 hours
  const baseMs = 5 * 60 * 1000;
  return Math.min(baseMs * Math.pow(2, failureCount - 1), 6 * 60 * 60 * 1000);
}

function isInBackoff(key: Pick<Doc<"apiKeys">, "refreshFailureCount" | "lastRefreshAttemptAt">, now: number): boolean {
  const failureCount = key.refreshFailureCount ?? 0;
  if (failureCount <= 0) return false;
  const lastAttemptAt = key.lastRefreshAttemptAt;
  if (!lastAttemptAt) return false;
  return now < lastAttemptAt + computeBackoffMs(failureCount);
}

function isExpiring(key: Pick<Doc<"apiKeys">, "tokenExpiresAt">, now: number): boolean {
  const expiresAt = key.tokenExpiresAt;
  if (expiresAt === undefined || expiresAt === null) return true;
  return expiresAt <= now + LEAD_TIME_MS;
}

/**
 * Query API keys that need a Codex OAuth refresh.
 */
export const getExpiringCodexKeys = internalQuery({
  args: {},
  handler: async (ctx): Promise<Array<Doc<"apiKeys">>> => {
    const now = Date.now();
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_envVar", (q) => q.eq("envVar", "CODEX_AUTH_JSON"))
      .collect();

    return keys.filter((key) => {
      const failureCount = key.refreshFailureCount ?? 0;
      if (failureCount >= MAX_FAILURES) return false;
      if (isInBackoff(key, now)) return false;
      return isExpiring(key, now);
    });
  },
});

export const updateRefreshedToken = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    value: v.string(),
    tokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.apiKeyId, {
      value: args.value,
      tokenExpiresAt: args.tokenExpiresAt,
      lastRefreshAttemptAt: Date.now(),
      lastRefreshError: undefined,
      refreshFailureCount: 0,
      updatedAt: Date.now(),
    });
  },
});

export const recordRefreshFailure = internalMutation({
  args: {
    apiKeyId: v.id("apiKeys"),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.apiKeyId);
    if (!key) return;
    const previousCount = key.refreshFailureCount ?? 0;
    await ctx.db.patch(args.apiKeyId, {
      lastRefreshAttemptAt: Date.now(),
      refreshFailureCount: previousCount + 1,
      lastRefreshError: args.error,
    });
  },
});

async function refreshWithToken(refreshToken: string): Promise<TokenRefreshResponse> {
  const response = await fetch(CODEX_OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CODEX_OAUTH_CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Codex token refresh failed: HTTP ${response.status} ${response.statusText} - ${text}`
    );
  }

  const json = (await response.json()) as unknown;
  const parsed = TokenRefreshResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error(
      `Codex token refresh failed: invalid response shape (${parsed.error.message})`
    );
  }
  return parsed.data;
}

function mergeRefreshedTokensIntoAuthJson(
  rawAuthJson: string,
  refreshed: TokenRefreshResponse,
  nowMs: number
): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(rawAuthJson);
  } catch {
    return null;
  }

  const tokenContainer =
    parsed && typeof parsed === "object" && parsed.tokens && typeof parsed.tokens === "object"
      ? parsed.tokens
      : parsed;

  if (!tokenContainer || typeof tokenContainer !== "object") {
    return null;
  }

  tokenContainer.access_token = refreshed.access_token;
  if (refreshed.refresh_token) tokenContainer.refresh_token = refreshed.refresh_token;
  if (refreshed.id_token) tokenContainer.id_token = refreshed.id_token;
  if (typeof refreshed.expires_in === "number") {
    tokenContainer.expires_at = nowMs + refreshed.expires_in * 1000;
  }

  if (parsed && typeof parsed === "object") {
    parsed.last_refresh = new Date(nowMs).toISOString();
  }

  return JSON.stringify(parsed, null, 2);
}

/**
 * Refresh expiring Codex OAuth tokens and write the updated token bundle back to Convex.
 *
 * Called by a 15-minute cron job.
 */
export const refreshExpiring = internalAction({
  args: {},
  handler: async (ctx) => {
    const keys = await ctx.runQuery(internal.codexTokenRefresh.getExpiringCodexKeys, {});
    if (keys.length === 0) return;

    console.log(`[codexTokenRefresh] Refreshing ${keys.length} Codex OAuth token(s)`);

    for (const key of keys) {
      const now = Date.now();
      try {
        const auth = parseCodexAuthJson(key.value);
        if (!auth) {
          console.log(
            `[codexTokenRefresh] Skipping key ${String(key._id)}: invalid CODEX_AUTH_JSON`
          );
          continue;
        }

        const refreshed = await refreshWithToken(auth.refresh_token);
        const merged = mergeRefreshedTokensIntoAuthJson(key.value, refreshed, now);
        if (!merged) {
          console.log(
            `[codexTokenRefresh] Skipping key ${String(key._id)}: failed to merge refreshed tokens`
          );
          continue;
        }

        const updatedAuth = parseCodexAuthJson(merged);
        const tokenExpiresAt = updatedAuth ? getCodexTokenExpiresAtMs(updatedAuth) : null;
        if (!tokenExpiresAt) {
          throw new Error("Unable to determine refreshed token expiry");
        }

        await ctx.runMutation(internal.codexTokenRefresh.updateRefreshedToken, {
          apiKeyId: key._id,
          value: merged,
          tokenExpiresAt,
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await ctx.runMutation(internal.codexTokenRefresh.recordRefreshFailure, {
          apiKeyId: key._id,
          error: errorMessage,
        });
        console.log(
          `[codexTokenRefresh] Failed to refresh key ${String(key._id)}: ${errorMessage}`
        );
      }
    }
  },
});

export const getTokenStatus = internalQuery({
  args: {
    teamId: v.string(),
    userId: v.string(),
  },
  handler: async (
    ctx,
    args
  ): Promise<"valid" | "expiring" | "expired" | "missing"> => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_team_user", (q) =>
        q.eq("teamId", args.teamId).eq("userId", args.userId)
      )
      .filter((q) => q.eq(q.field("envVar"), "CODEX_AUTH_JSON"))
      .first();

    if (!key) return "missing";

    const auth = parseCodexAuthJson(key.value);
    if (!auth) return "missing";

    const expiresAt =
      key.tokenExpiresAt ?? getCodexTokenExpiresAtMs(auth) ?? undefined;
    if (!expiresAt) return "missing";

    const now = Date.now();
    if (expiresAt <= now) return "expired";
    if (expiresAt <= now + LEAD_TIME_MS) return "expiring";
    return "valid";
  },
});
