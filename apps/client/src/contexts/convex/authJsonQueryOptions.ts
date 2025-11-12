import { cachedGetUser } from "@/lib/cachedGetUser";
import { stackClientApp } from "@/lib/stack";
import { queryOptions } from "@tanstack/react-query";

export type AuthJsonPayload = {
  accessToken: string | null;
  refreshedAccessToken?: string | null;
  [key: string]: unknown;
};

export type AuthJson = AuthJsonPayload | null;

export interface StackUserLike {
  getAuthJson: () => Promise<AuthJsonPayload>;
}

// Refresh every 9 minutes to beat the ~10 minute Stack access token expiry window
export const defaultAuthJsonRefreshInterval = 9 * 60 * 1000;

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
