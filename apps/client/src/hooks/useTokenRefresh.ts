import { useEffect, useRef } from "react";
import { stackClientApp } from "../lib/stack";
import { cachedGetUser } from "../lib/cachedGetUser";

const REFRESH_INTERVAL_MS = 25 * 60 * 1000; // 25 minutes in milliseconds

/**
 * Hook that automatically refreshes the authentication token every 25 minutes
 * to prevent token expiration during long sessions.
 */
export function useTokenRefresh() {
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    const refreshToken = async () => {
      try {
        // Get the current user
        const user = await cachedGetUser(stackClientApp);

        if (!user) {
          console.warn("[TokenRefresh] No user found, skipping token refresh");
          return;
        }

        // Getting tokens triggers Stack Auth's internal refresh mechanism
        // if the token is close to expiring
        const tokens = await user.currentSession.getTokens();

        if (tokens.accessToken) {
          console.log("[TokenRefresh] Token refreshed successfully");
        } else {
          console.warn("[TokenRefresh] No access token after refresh attempt");
        }
      } catch (error) {
        console.error("[TokenRefresh] Error refreshing token:", error);
      }
    };

    // Initial refresh when component mounts
    refreshToken();

    // Set up interval to refresh every 25 minutes
    intervalRef.current = window.setInterval(refreshToken, REFRESH_INTERVAL_MS);

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current !== null) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);
}
