import {
  convexClientCache,
  ConvexHttpClient,
} from "@cmux/shared/node/convex-cache";
import { getAuthToken } from "./requestContext";
import { env } from "./server-env";

// Return a Convex client bound to the current auth context (requires auth)
export function getConvex() {
  const auth = getAuthToken();
  if (!auth) {
    throw new Error("No auth token found");
  }

  // Try to get from cache first
  const cachedClient = convexClientCache.get(auth, env.NEXT_PUBLIC_CONVEX_URL);
  if (cachedClient) {
    return cachedClient;
  }

  // Create new client and cache it
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(auth);
  convexClientCache.set(auth, env.NEXT_PUBLIC_CONVEX_URL, client);
  return client;
}

// Return a Convex client without auth (for public queries)
// Caches with a special "public" key
export function getPublicConvex() {
  const cacheKey = "__public__";
  const cachedClient = convexClientCache.get(cacheKey, env.NEXT_PUBLIC_CONVEX_URL);
  if (cachedClient) {
    return cachedClient;
  }

  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  convexClientCache.set(cacheKey, env.NEXT_PUBLIC_CONVEX_URL, client);
  return client;
}

export type { ConvexHttpClient };
