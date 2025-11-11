import { client as wwwOpenAPIClient } from "@cmux/www-openapi-client/client.gen";
import { StackClientApp } from "@stackframe/react";
import { useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import { env, isStackAuthConfigured } from "../client-env-with-fallback";
import { signalConvexAuthReady } from "../contexts/convex/convex-auth-ready";
import { convexQueryClient } from "../contexts/convex/convex-query-client";
import { cachedGetUser } from "./cachedGetUser";
import { WWW_ORIGIN } from "./wwwOrigin";

let stackClientApp: StackClientApp | null = null;

// Only initialize Stack Auth if it's properly configured
if (isStackAuthConfigured()) {
  try {
    stackClientApp = new StackClientApp({
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
      }
    );
  } catch (error) {
    console.error(
      "[StackClientApp] Failed to initialize Stack Auth client:",
      error
    );
    stackClientApp = null;
  }
} else {
  console.error(
    "[StackClientApp] Stack Auth is not configured. Authentication will not work."
  );
}

export { stackClientApp };

/**
 * Get Stack Client App or throw if unavailable
 */
export function requireStackClientApp(): StackClientApp {
  if (!stackClientApp) {
    throw new Error(
      "Stack Auth client is not available. Please check your configuration."
    );
  }
  return stackClientApp;
}

const fetchWithAuth = (async (request: Request) => {
  if (!stackClientApp) {
    throw new Error("Stack Auth is not configured");
  }
  const user = await cachedGetUser(stackClientApp);
  if (!user) {
    throw new Error("User not found");
  }
  const authHeaders = await user.getAuthHeaders();
  const mergedHeaders = new Headers();
  for (const [key, value] of Object.entries(authHeaders)) {
    mergedHeaders.set(key, value);
  }
  for (const [key, value] of request instanceof Request
    ? request.headers.entries()
    : []) {
    mergedHeaders.set(key, value);
  }
  const response = await fetch(request, {
    headers: mergedHeaders,
  });
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
}) as typeof fetch; // TODO: remove when bun types dont conflict with node types

wwwOpenAPIClient.setConfig({
  baseUrl: WWW_ORIGIN,
  fetch: fetchWithAuth,
});
