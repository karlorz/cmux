import { stackClientApp } from "./stack";
import { cachedGetUser } from "./cachedGetUser";

/**
 * Forces a refresh of the authentication token by clearing the cache
 * and fetching fresh credentials from the Stack SDK.
 *
 * This is useful when receiving 401 errors or when you know the token
 * has expired and needs to be refreshed.
 *
 * @returns The refreshed user object with new tokens, or null if auth failed
 */
export async function refreshAuth() {
  console.log("[Auth] Forcing token refresh by clearing cache");

  // Clear the cached user to force a fresh fetch
  window.cachedUser = null;
  window.userPromise = null;

  // Fetch fresh user with new tokens
  const user = await cachedGetUser(stackClientApp);

  if (!user) {
    console.error("[Auth] Failed to refresh authentication - user not found");
    return null;
  }

  // Verify we got a valid access token
  try {
    const tokens = await user.currentSession.getTokens();
    if (!tokens.accessToken) {
      console.error("[Auth] Refreshed user has no access token");
      return null;
    }
    console.log("[Auth] Successfully refreshed authentication tokens");
    return user;
  } catch (error) {
    console.error("[Auth] Error validating refreshed tokens:", error);
    return null;
  }
}
