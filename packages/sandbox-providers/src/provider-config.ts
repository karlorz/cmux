/**
 * Provider Configuration
 *
 * Functions to determine which sandbox provider to use based on
 * environment variables or explicit configuration.
 */

import type { SandboxEnvVars, SandboxProvider, SandboxProviderConfig } from "./types";

/**
 * Determines which sandbox provider to use based on available environment variables.
 *
 * Selection priority:
 * 1. If SANDBOX_PROVIDER is explicitly set, use that provider
 * 2. If MORPH_API_KEY is set, use Morph (original provider)
 * 3. If PVE_API_URL and PVE_API_TOKEN are set, use PVE LXC
 * 4. Throw error if no provider is configured
 *
 * @param envVars - Environment variables to check
 * @returns Configuration for the active sandbox provider
 */
export function getActiveSandboxProvider(envVars: SandboxEnvVars): SandboxProviderConfig {
  const explicitProvider = envVars.SANDBOX_PROVIDER;

  // Explicit provider selection
  if (explicitProvider === "pve-lxc") {
    if (!envVars.PVE_API_URL || !envVars.PVE_API_TOKEN) {
      throw new Error(
        "PVE provider selected but PVE_API_URL or PVE_API_TOKEN is not set."
      );
    }
    return {
      provider: "pve-lxc",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
      publicDomain: envVars.PVE_PUBLIC_DOMAIN,
      verifyTls: envVars.PVE_VERIFY_TLS,
    };
  }

  if (explicitProvider === "pve-vm") {
    if (!envVars.PVE_API_URL || !envVars.PVE_API_TOKEN) {
      throw new Error(
        "SANDBOX_PROVIDER=pve-vm but PVE_API_URL or PVE_API_TOKEN is not set."
      );
    }
    return {
      provider: "pve-vm",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
      publicDomain: envVars.PVE_PUBLIC_DOMAIN,
      verifyTls: envVars.PVE_VERIFY_TLS,
    };
  }

  if (explicitProvider === "morph") {
    if (!envVars.MORPH_API_KEY) {
      throw new Error("SANDBOX_PROVIDER=morph but MORPH_API_KEY is not set.");
    }
    return {
      provider: "morph",
      apiKey: envVars.MORPH_API_KEY,
    };
  }

  // Auto-detect: Morph takes priority if both are set
  if (envVars.MORPH_API_KEY) {
    return {
      provider: "morph",
      apiKey: envVars.MORPH_API_KEY,
    };
  }

  // Check for Proxmox VE LXC (auto-detect defaults to LXC)
  if (envVars.PVE_API_URL && envVars.PVE_API_TOKEN) {
    return {
      provider: "pve-lxc",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
      publicDomain: envVars.PVE_PUBLIC_DOMAIN,
      verifyTls: envVars.PVE_VERIFY_TLS,
    };
  }

  throw new Error(
    "No sandbox provider configured. Set either MORPH_API_KEY or (PVE_API_URL + PVE_API_TOKEN)."
  );
}

/**
 * Check if Morph provider is available based on environment variables.
 */
export function isMorphAvailable(envVars: SandboxEnvVars): boolean {
  return Boolean(envVars.MORPH_API_KEY);
}

/**
 * Check if Proxmox provider is available based on environment variables.
 */
export function isProxmoxAvailable(envVars: SandboxEnvVars): boolean {
  return Boolean(envVars.PVE_API_URL && envVars.PVE_API_TOKEN);
}

/**
 * Get a list of all available sandbox providers based on environment variables.
 */
export function getAvailableSandboxProviders(envVars: SandboxEnvVars): SandboxProvider[] {
  const providers: SandboxProvider[] = [];
  if (isMorphAvailable(envVars)) {
    providers.push("morph");
  }
  if (isProxmoxAvailable(envVars)) {
    providers.push("pve-lxc");
  }
  return providers;
}
