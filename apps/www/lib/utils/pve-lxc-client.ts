import { PveLxcClient } from "@cmux/pve-lxc-client";
import { env } from "./www-env";

export * from "@cmux/pve-lxc-client";

/**
 * Create a PVE LXC client instance configured from www env.
 */
export function getPveLxcClient(): PveLxcClient {
  if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
    throw new Error("PVE API URL and token not configured");
  }

  return new PveLxcClient({
    apiUrl: env.PVE_API_URL,
    apiToken: env.PVE_API_TOKEN,
    node: env.PVE_NODE,
    publicDomain: env.PVE_PUBLIC_DOMAIN,
    verifyTls: Boolean(env.PVE_VERIFY_TLS),
  });
}
