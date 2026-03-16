import {
  convexClientCache,
  ConvexHttpClient,
} from "@cmux/shared/node/convex-cache";
import { env } from "./www-env";

export function getConvex({ accessToken }: { accessToken: string }) {
  // Try to get from cache first
  const cachedClient = convexClientCache.get(
    accessToken,
    env.NEXT_PUBLIC_CONVEX_URL
  );
  if (cachedClient) {
    return cachedClient;
  }

  // Create new client and cache it
  const client = new ConvexHttpClient(env.NEXT_PUBLIC_CONVEX_URL);
  client.setAuth(accessToken);
  convexClientCache.set(accessToken, env.NEXT_PUBLIC_CONVEX_URL, client);
  return client;
}

// Admin client type for internal queries/mutations (requires CONVEX_DEPLOY_KEY)
export interface ConvexAdminClient {
  setAdminAuth: (token: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (queryRef: any, args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: (mutationRef: any, args: any) => Promise<any>;
}

let adminClient: ConvexAdminClient | null = null;

export function getConvexAdmin(): ConvexAdminClient | null {
  const deployKey = process.env.CONVEX_DEPLOY_KEY;
  if (!deployKey) {
    console.warn("[getConvexAdmin] CONVEX_DEPLOY_KEY not set");
    return null;
  }

  if (!adminClient) {
    adminClient = new ConvexHttpClient(
      env.NEXT_PUBLIC_CONVEX_URL
    ) as unknown as ConvexAdminClient;
    adminClient.setAdminAuth(deployKey);
  }
  return adminClient;
}
