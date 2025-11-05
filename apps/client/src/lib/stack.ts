import { client as wwwOpenAPIClient } from "@cmux/www-openapi-client/client.gen";
import { StackClientApp } from "@stackframe/react";
import { useNavigate as useTanstackNavigate } from "@tanstack/react-router";
import { env } from "../client-env";
import { signalConvexAuthReady } from "../contexts/convex/convex-auth-ready";
import { convexQueryClient } from "../contexts/convex/convex-query-client";
import { queryClient } from "../query-client";
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

const convexClientAuthFetcher = stackClientApp.getConvexClientAuth({
  tokenStore: "cookie",
});

convexQueryClient.convexClient.setAuth(
  convexClientAuthFetcher,
  (isAuthenticated) => {
    signalConvexAuthReady(isAuthenticated);
  },
);

type ApiErrorDetails = {
  bodyText: string;
  parsedJson?: unknown;
};

const AUTH_JSON_QUERY_KEY = ["authJson"] as const;
const TOKEN_REFRESH_MAX_RETRIES = 1;

let refreshingTokensPromise: Promise<void> | null = null;

async function forceRefreshStackTokens() {
  if (!refreshingTokensPromise) {
    refreshingTokensPromise = (async () => {
      try {
        await convexClientAuthFetcher({ forceRefreshToken: true });
        await queryClient.invalidateQueries({
          queryKey: AUTH_JSON_QUERY_KEY,
        });
      } catch (error) {
        console.error("[Auth] Failed to refresh tokens", error);
        throw error;
      } finally {
        refreshingTokensPromise = null;
      }
    })();
  }
  return refreshingTokensPromise;
}

function isExpiredTokenError(details: ApiErrorDetails | null): boolean {
  if (!details?.parsedJson || typeof details.parsedJson !== "object") {
    return false;
  }
  const maybeRecord = details.parsedJson as Record<string, unknown>;
  const code = maybeRecord.code;
  const message = maybeRecord.message;
  return (
    code === "InvalidAuthHeader" &&
    typeof message === "string" &&
    message.toLowerCase().includes("token expired")
  );
}

async function readErrorDetails(
  response: Response,
): Promise<ApiErrorDetails | null> {
  try {
    const bodyText = await response.clone().text();
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(bodyText);
    } catch {
      // Swallow JSON parse errors; we only need the raw text for logging.
    }
    return { bodyText, parsedJson };
  } catch (error) {
    console.error("[APIError] Failed to read error body", error);
    return null;
  }
}

function logApiError(response: Response, details: ApiErrorDetails | null) {
  console.error("[APIError]", {
    url: response.url,
    status: response.status,
    statusText: response.statusText,
    body: details?.bodyText ? details.bodyText.slice(0, 2000) : undefined,
  });
}

async function buildAuthorizedRequest(request: Request) {
  const user = await cachedGetUser(stackClientApp);
  if (!user) {
    throw new Error("User not found");
  }
  const authHeaders = await user.getAuthHeaders();
  const mergedHeaders = new Headers();
  for (const [key, value] of Object.entries(authHeaders)) {
    mergedHeaders.set(key, value);
  }
  request.headers.forEach((value, key) => {
    mergedHeaders.set(key, value);
  });
  return new Request(request, {
    headers: mergedHeaders,
  });
}

async function executeAuthorizedFetch(request: Request) {
  const requestForAttempt = request.clone();
  const authedRequest = await buildAuthorizedRequest(requestForAttempt);
  return fetch(authedRequest);
}

async function fetchWithRetry(request: Request, attempt: number) {
  const response = await executeAuthorizedFetch(request);
  if (response.ok) {
    return response;
  }

  const errorDetails = await readErrorDetails(response);

  const shouldAttemptRefresh =
    [400, 401, 403].includes(response.status) &&
    attempt < TOKEN_REFRESH_MAX_RETRIES &&
    isExpiredTokenError(errorDetails);

  if (shouldAttemptRefresh) {
    try {
      await forceRefreshStackTokens();
      return fetchWithRetry(request, attempt + 1);
    } catch (error) {
      console.error("[Auth] Failed to refresh expired token", error);
    }
  }

  logApiError(response, errorDetails);
  return response;
}

const fetchWithAuth = (async function fetchWithAuth(
  input: RequestInfo,
  init?: RequestInit,
) {
  const baseRequest = new Request(input, init);
  return fetchWithRetry(baseRequest, 0);
}) as typeof fetch; // TODO: remove when bun types dont conflict with node types

wwwOpenAPIClient.setConfig({
  baseUrl: WWW_ORIGIN,
  fetch: fetchWithAuth,
});
