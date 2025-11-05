import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { authJsonQueryOptions } from "../contexts/convex/authJsonQueryOptions";
import { convexQueryClient } from "../contexts/convex/convex-query-client";

/**
 * Hook that watches for auth token changes and syncs them with the Convex client.
 * This ensures that when tokens are refreshed (every 9 minutes), the Convex client
 * is updated to prevent "Token expired" errors during idle sessions.
 */
export function useConvexAuthSync() {
  const authJsonQuery = useQuery(authJsonQueryOptions());
  const prevTokenRef = useRef<string | null>(null);

  useEffect(() => {
    const currentToken = authJsonQuery.data?.accessToken ?? null;

    // Only update if token has changed
    if (currentToken !== prevTokenRef.current) {
      console.log("[useConvexAuthSync] Token changed, updating Convex client auth");
      prevTokenRef.current = currentToken;

      // Update the Convex client with the new token
      if (currentToken) {
        convexQueryClient.convexClient.setAuth(() => Promise.resolve(currentToken));
      }
    }
  }, [authJsonQuery.data?.accessToken]);
}
