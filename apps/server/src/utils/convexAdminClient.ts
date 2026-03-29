import { ConvexHttpClient } from "@cmux/shared/node/convex-cache";
import { env } from "./server-env";

export interface ConvexAdminClient {
  setAdminAuth: (token: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: (queryRef: any, args: any) => Promise<any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  mutation: (mutationRef: any, args: any) => Promise<any>;
}

let adminClient: ConvexAdminClient | null = null;

export function getConvexAdmin(): ConvexAdminClient | null {
  const adminKey =
    process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_SELF_HOSTED_ADMIN_KEY;

  if (!adminKey) {
    return null;
  }

  if (!adminClient) {
    adminClient = new ConvexHttpClient(
      env.NEXT_PUBLIC_CONVEX_URL,
    ) as unknown as ConvexAdminClient;
    adminClient.setAdminAuth(adminKey);
  }

  return adminClient;
}
