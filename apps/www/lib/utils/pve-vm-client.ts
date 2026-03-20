/**
 * PVE VM Client - Thin wrapper around @cmux/pve-vm-client
 *
 * Re-exports the client classes and types from the package,
 * and provides a factory function that configures the client
 * from www environment variables.
 */

import { PveVmClient } from "@cmux/pve-vm-client";
import { env } from "./www-env";

export { PveVmClient, PveVmInstance } from "@cmux/pve-vm-client";
export type {
  PveVmClientConfig,
  ExecResult,
  HttpService,
  VmNetworking,
  VmMetadata,
  VmStatus,
  StartVmOptions,
} from "@cmux/pve-vm-client";

// NOTE: PVE VM presets are not yet defined.
// When implementing, create pve-vm-defaults.ts similar to pve-lxc-defaults.ts

/**
 * Resolve a snapshot ID to a template VMID.
 * NOTE: This is a placeholder - actual implementation requires PVE VM preset data.
 */
function resolveSnapshot(_snapshotId: string): { templateVmid: number } {
  // TODO: Implement when PVE VM presets are defined
  // For now, throw to indicate the provider isn't ready
  throw new Error("PVE VM snapshot resolution not yet implemented");
}

/**
 * Create a PVE VM client instance configured from environment variables.
 * Uses the same PVE_* environment variables as the LXC client.
 */
export function getPveVmClient(): PveVmClient {
  if (!env.PVE_API_URL || !env.PVE_API_TOKEN) {
    throw new Error("PVE API URL and token not configured");
  }

  return new PveVmClient({
    apiUrl: env.PVE_API_URL,
    apiToken: env.PVE_API_TOKEN,
    node: env.PVE_NODE,
    publicDomain: env.PVE_PUBLIC_DOMAIN,
    verifyTls: Boolean(env.PVE_VERIFY_TLS),
    snapshotResolver: resolveSnapshot,
  });
}
