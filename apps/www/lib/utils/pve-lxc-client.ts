/**
 * PVE LXC Client
 *
 * Re-exports from @cmux/sandbox-providers for backwards compatibility.
 * Also provides the getPveLxcClient() factory function that uses www-env.
 */

import { env } from "./www-env";

// Re-export everything from the package
export {
  PveLxcClient,
  PveLxcInstance,
  createPveLxcClient,
  type ContainerMetadata,
  type ContainerNetworking,
  type ContainerStatus,
  type PveLxcClientOptions,
  type StartContainerOptions,
} from "@cmux/sandbox-providers/pve-lxc";

// Also re-export ExecResult and HttpService for compatibility
export type { ExecResult, HttpService } from "@cmux/sandbox-providers";

// Import for factory function
import { PveLxcClient } from "@cmux/sandbox-providers/pve-lxc";

/**
 * Create a PVE LXC client instance using www-env variables.
 * This is the www-specific factory function.
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
    verifyTls: env.PVE_VERIFY_TLS,
  });
}
