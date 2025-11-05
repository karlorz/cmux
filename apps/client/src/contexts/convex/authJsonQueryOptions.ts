import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { queryOptions } from "@tanstack/react-query";
import { decodeJwt } from "jose";

export type AuthJson =
  | {
      accessToken: string | null;
      refreshToken?: string | null;
    }
  | null;

export interface StackUserLike {
  getAuthJson: () => Promise<{ accessToken: string | null }>;
}

export const AUTH_JSON_REFRESH_BUFFER_MS = 60 * 1000; // refresh a minute before expiry
export const MIN_AUTH_JSON_REFRESH_INTERVAL_MS = 30 * 1000;
export const DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS = 4 * 60 * 1000;

export function getAuthJsonRefetchIntervalMs(
  accessToken: string | null | undefined
): number {
  if (!accessToken) {
    return DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS;
  }

  try {
    const payload = decodeJwt(accessToken);
    if (!payload.exp) {
      return DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS;
    }

    const expiresInMs = payload.exp * 1000 - Date.now();
    if (!Number.isFinite(expiresInMs)) {
      return DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS;
    }

    return Math.max(
      expiresInMs - AUTH_JSON_REFRESH_BUFFER_MS,
      MIN_AUTH_JSON_REFRESH_INTERVAL_MS
    );
  } catch {
    return DEFAULT_AUTH_JSON_REFRESH_INTERVAL_MS;
  }
}

export function authJsonQueryOptions() {
  return queryOptions<AuthJson>({
    queryKey: ["authJson"],
    queryFn: async () => {
      const user = await cachedGetUser(stackClientApp);
      if (!user) return null;
      const authJson = await user.getAuthJson();
      return authJson ?? null;
    },
    refetchInterval: (query) =>
      getAuthJsonRefetchIntervalMs(
        (query.state.data as AuthJson | undefined)?.accessToken
      ),
    refetchIntervalInBackground: true,
  });
}
