import { client as wwwOpenAPIClient } from "@cmux/www-openapi-client/client.gen";
import { StackClientApp } from "@stackframe/react";
import { useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import { env } from "../client-env";
import { signalConvexAuthReady } from "../contexts/convex/convex-auth-ready";
import { convexQueryClient } from "../contexts/convex/convex-query-client";
import { cachedGetUser } from "./cachedGetUser";
import { WWW_ORIGIN } from "./wwwOrigin";

export const stackClientApp = new StackClientApp({
  projectId: env.NEXT_PUBLIC_STACK_PROJECT_ID,
  publishableClientKey: env.NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY,
  tokenStore: "cookie",
  redirectMethod: {
    useNavigate() {
      const navigate = useTanstackNavigate();
      return (to: string) => {
        navigate({ to });
      };
    },
  },
});

convexQueryClient.convexClient.setAuth(
  stackClientApp.getConvexClientAuth({ tokenStore: "cookie" }),
  (isAuthenticated) => {
    signalConvexAuthReady(isAuthenticated);
  },
);

const fetchWithAuth = (async (request: Request) => {
  // Helper function to make the actual request with retry logic
  async function makeRequestWithAuth(req: Request, isRetry = false): Promise<Response> {
    const user = await cachedGetUser(stackClientApp);
    if (!user) {
      throw new Error("User not found");
    }
    const authHeaders = await user.getAuthHeaders();
    const mergedHeaders = new Headers();
    for (const [key, value] of Object.entries(authHeaders)) {
      mergedHeaders.set(key, value);
    }
    for (const [key, value] of req instanceof Request
      ? req.headers.entries()
      : []) {
      mergedHeaders.set(key, value);
    }
    const response = await fetch(req, {
      headers: mergedHeaders,
    });

    // Handle 401 Unauthorized errors with automatic token refresh and retry
    if (response.status === 401 && !isRetry) {
      console.warn("[Auth] Received 401 Unauthorized, clearing cached user and retrying with fresh token");

      // Clear cached user to force token refresh on next call
      window.cachedUser = null;
      window.userPromise = null;

      // Clone the request to retry
      const clonedRequest = req.clone();

      // Retry the request once with fresh credentials
      return makeRequestWithAuth(clonedRequest, true);
    }

    if (!response.ok) {
      try {
        const clone = response.clone();
        const bodyText = await clone.text();
        console.error("[APIError]", {
          url: response.url,
          status: response.status,
          statusText: response.statusText,
          body: bodyText.slice(0, 2000),
        });
      } catch (e) {
        console.error("[APIError] Failed to read error body", e);
      }
    }
    return response;
  }

  return makeRequestWithAuth(request);
}) as typeof fetch; // TODO: remove when bun types dont conflict with node types

wwwOpenAPIClient.setConfig({
  baseUrl: WWW_ORIGIN,
  fetch: fetchWithAuth,
});
