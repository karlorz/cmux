/**
 * Sandbox Provider
 *
 * Re-exports from @cmux/sandbox-providers and sandbox-providers-bridge
 * for backwards compatibility.
 */

// Re-export types from the package
export type { SandboxProvider, SandboxProviderConfig } from "@cmux/sandbox-providers";

// Re-export bridge functions that use www-env
export {
  getActiveSandboxProviderFromEnv as getActiveSandboxProvider,
  isMorphAvailableFromEnv as isMorphAvailable,
  isProxmoxAvailableFromEnv as isProxmoxAvailable,
  getAvailableSandboxProvidersFromEnv as getAvailableSandboxProviders,
} from "./sandbox-providers-bridge";
