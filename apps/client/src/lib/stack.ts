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

/**
 * Checks if a response indicates an expired/invalid auth token.
 * Only matches specific token expiration errors, not general auth failures.
 */
function isTokenExpiredResponse(status: number, bodyText: string): boolean {
  if (status !== 401) return false;
  const lowerBody = bodyText.toLowerCase();
  return (
    lowerBody.includes("token expired") ||
    lowerBody.includes("invalid auth header expired") ||
    lowerBody.includes("jwt expired") ||
    lowerBody.includes("token has expired")
  );
}

/**
 * Clears the cached user to force a fresh fetch with token refresh on next call.
 */
function clearCachedUser(): void {
  if (typeof window !== "undefined") {
    window.cachedUser = null;
    window.userPromise = null;
  }
}

/**
 * Tracks ongoing refresh to prevent multiple simultaneous refresh attempts.
 */
let refreshPromise: Promise<void> | null = null;

/**
 * Refreshes the auth token with debouncing to prevent race conditions.
 * Multiple concurrent calls will share the same refresh operation.
 */
async function refreshAuthToken(): Promise<void> {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    try {
      clearCachedUser();
      // Fetching the user triggers Stack Auth's internal refresh
      await cachedGetUser(stackClientApp);
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

const fetchWithAuth = (async (request: Request) => {
  // Clone the request upfront for potential retry (request body can only be consumed once)
  const requestForRetry = request.clone();

  const makeRequest = async (req: Request): Promise<Response> => {
    const user = await cachedGetUser(stackClientApp);
    if (!user) {
      throw new Error("User not found");
    }

    // getAuthHeaders() should return fresh headers - Stack Auth handles refresh internally
    const authHeaders = await user.getAuthHeaders();
    const mergedHeaders = new Headers();
    for (const [key, value] of Object.entries(authHeaders)) {
      mergedHeaders.set(key, value);
    }
    for (const [key, value] of req.headers.entries()) {
      mergedHeaders.set(key, value);
    }

    const response = await fetch(req, {
      headers: mergedHeaders,
    });

    return response;
  };

  // First attempt
  let response = await makeRequest(request);

  // Check if it's an auth error that warrants a retry
  if (response.status === 401) {
    const clone = response.clone();
    let bodyText = "";
    try {
      bodyText = await clone.text();
    } catch (e) {
      console.error("[APIError] Failed to read error body for retry check", e);
    }

    if (isTokenExpiredResponse(response.status, bodyText)) {
      console.warn(
        "[Auth] Token expired, refreshing and retrying with fresh token..."
      );

      // Refresh the token (debounced to prevent race conditions)
      try {
        await refreshAuthToken();

        // Retry the request with fresh auth headers using the cloned request
        response = await makeRequest(requestForRetry);
        if (response.ok) {
          console.log("[Auth] Retry succeeded with refreshed token");
        }
      } catch (retryError) {
        console.error("[Auth] Retry failed after token refresh:", retryError);
        // Return the original 401 response if retry fails
      }
    }
  }

  // Log non-OK responses for debugging
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

class WwwOpenApiHttpError extends Error {
  status: number;
  statusText: string;
  url: string;
  body: unknown;

  constructor(args: {
    message: string;
    status: number;
    statusText: string;
    url: string;
    body: unknown;
  }) {
    super(args.message);
    this.name = "WwwOpenApiHttpError";
    this.status = args.status;
    this.statusText = args.statusText;
    this.url = args.url;
    this.body = args.body;
  }
}

function stringifyOpenApiErrorBody(body: unknown): string | null {
  if (typeof body === "string") return body;
  if (!body || typeof body !== "object") return null;
  if ("message" in body && typeof (body as { message?: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  if ("error" in body && typeof (body as { error?: unknown }).error === "string") {
    return (body as { error: string }).error;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return null;
  }
}

function attachWwwOpenApiErrorInterceptor() {
  if (typeof window === "undefined") return;
  const w = window as Window & { __cmuxWwwOpenApiErrInterceptorAttached?: boolean };
  if (w.__cmuxWwwOpenApiErrInterceptorAttached) return;

  wwwOpenAPIClient.interceptors.error.use((body, response) => {
    const message =
      stringifyOpenApiErrorBody(body) ??
      `Request failed: ${response.status} ${response.statusText}`.trim();
    return new WwwOpenApiHttpError({
      message,
      status: response.status,
      statusText: response.statusText,
      url: response.url,
      body,
    });
  });

  w.__cmuxWwwOpenApiErrInterceptorAttached = true;
}

attachWwwOpenApiErrorInterceptor();
