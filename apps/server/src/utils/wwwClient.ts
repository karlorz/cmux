import { getAuthHeaderJson, getAuthToken } from "./requestContext";
import { getWwwInternalUrl } from "./server-env";
import { getWwwOpenApiClientModule } from "./wwwOpenApiModule";

const { createClient } = await getWwwOpenApiClientModule();

// Return a configured OpenAPI client bound to the current auth context
export function getWwwClient() {
  // Provide a fetch-compatible wrapper that preserves any extended properties
  // required by the environment (e.g. Next.js-enhanced fetch with preconnect).
  const wrappedFetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const token = getAuthToken();
      const authHeaderJson = getAuthHeaderJson();
      if (!authHeaderJson) {
        throw new Error("No auth header json found");
      }

      const baseHeaders =
        init?.headers ?? (input instanceof Request ? input.headers : undefined);
      const headers = new Headers(baseHeaders);
      if (token) {
        headers.set("x-stack-auth", authHeaderJson);
      }

      return fetch(input, { ...init, headers });
    },
    fetch
  ) as typeof fetch;

  // Create an isolated client per call to avoid cross-test baseUrl bleed-through
  const client = createClient();
  client.setConfig({
    baseUrl: getWwwInternalUrl(),
    fetch: wrappedFetch,
  });
  return client;
}

/**
 * Return a configured OpenAPI client using JWT authentication.
 * Use this for server-to-www calls when Stack Auth is not available
 * (e.g., JWT-authenticated agent spawning sub-agents).
 */
export function getWwwClientWithJwt(jwt: string) {
  const wrappedFetch = Object.assign(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const baseHeaders =
        init?.headers ?? (input instanceof Request ? input.headers : undefined);
      const headers = new Headers(baseHeaders);
      headers.set("x-cmux-token", jwt);

      return fetch(input, { ...init, headers });
    },
    fetch
  ) as typeof fetch;

  const client = createClient();
  client.setConfig({
    baseUrl: getWwwInternalUrl(),
    fetch: wrappedFetch,
  });
  return client;
}
