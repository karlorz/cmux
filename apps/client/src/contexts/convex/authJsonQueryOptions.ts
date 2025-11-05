import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { queryOptions } from "@tanstack/react-query";
import { decodeJwt } from "jose";

export type AuthJson = { accessToken: string | null } | null;

export interface StackUserLike {
  getAuthJson: () => Promise<{ accessToken: string | null }>;
}

const DEFAULT_REFRESH_INTERVAL_MS = 60 * 1000; // fall back to 1 minute
const REFRESH_BUFFER_MS = 60 * 1000; // refresh 1 minute before expiry
const MIN_REFRESH_INTERVAL_MS = 15 * 1000;
const MAX_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

function msUntilExpiry(authJson: AuthJson): number | null {
  if (!authJson?.accessToken) return null;
  try {
    const payload = decodeJwt(authJson.accessToken);
    if (typeof payload.exp !== "number") return null;
    return payload.exp * 1000 - Date.now();
  } catch {
    return null;
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
    refetchInterval: (query) => {
      const timeUntilExpiry = msUntilExpiry(query.state.data ?? null);
      if (timeUntilExpiry === null) {
        return DEFAULT_REFRESH_INTERVAL_MS;
      }
      const interval =
        timeUntilExpiry - REFRESH_BUFFER_MS > MAX_REFRESH_INTERVAL_MS
          ? MAX_REFRESH_INTERVAL_MS
          : timeUntilExpiry - REFRESH_BUFFER_MS;
      if (!Number.isFinite(interval) || interval <= 0) {
        return MIN_REFRESH_INTERVAL_MS;
      }
      return Math.max(MIN_REFRESH_INTERVAL_MS, interval);
    },
    refetchIntervalInBackground: true,
  });
}
