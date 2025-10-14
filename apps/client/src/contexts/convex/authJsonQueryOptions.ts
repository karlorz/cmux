import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { queryOptions } from "@tanstack/react-query";

export type AuthJson = { accessToken: string | null } | null;

export interface StackUserLike {
  getAuthJson: () => Promise<{ accessToken: string | null }>;
}

// Refresh slightly before the 30 minute token expiry to avoid invalid token errors
export const defaultAuthJsonRefreshInterval = 25 * 60 * 1000;

export function authJsonQueryOptions() {
  return queryOptions<AuthJson>({
    queryKey: ["authJson"],
    queryFn: async () => {
      const user = await cachedGetUser(stackClientApp);
      if (!user) return null;
      const authJson = await user.getAuthJson();
      return authJson ?? null;
    },
    refetchInterval: defaultAuthJsonRefreshInterval,
    refetchIntervalInBackground: true,
  });
}
