/**
 * Sandbox Providers Bridge
 *
 * Thin adapter layer that connects @cmux/sandbox-providers
 * to the www app's environment variables.
 */

import {
  ProviderRegistry,
  type ProviderRegistryConfig,
  getActiveSandboxProvider,
  isMorphAvailable,
  isProxmoxAvailable,
  getAvailableSandboxProviders,
  type SandboxEnvVars,
  type SandboxProvider,
  type SandboxProviderConfig,
} from "@cmux/sandbox-providers";
import { env } from "./www-env";

/**
 * Build the sandbox environment variables from www-env.
 * This bridges the www-env types to the package's SandboxEnvVars interface.
 */
function buildSandboxEnvVars(): SandboxEnvVars {
  return {
    SANDBOX_PROVIDER: env.SANDBOX_PROVIDER,
    MORPH_API_KEY: env.MORPH_API_KEY,
    PVE_API_URL: env.PVE_API_URL,
    PVE_API_TOKEN: env.PVE_API_TOKEN,
    PVE_NODE: env.PVE_NODE,
    PVE_PUBLIC_DOMAIN: env.PVE_PUBLIC_DOMAIN,
    PVE_VERIFY_TLS: env.PVE_VERIFY_TLS,
  };
}

/**
 * Build the provider registry configuration from www-env.
 */
function buildRegistryConfig(): ProviderRegistryConfig {
  const config: ProviderRegistryConfig = {};

  if (env.MORPH_API_KEY) {
    config.morph = {
      apiKey: env.MORPH_API_KEY,
    };
  }

  if (env.PVE_API_URL && env.PVE_API_TOKEN) {
    config.pveLxc = {
      apiUrl: env.PVE_API_URL,
      apiToken: env.PVE_API_TOKEN,
      node: env.PVE_NODE,
      publicDomain: env.PVE_PUBLIC_DOMAIN,
      verifyTls: env.PVE_VERIFY_TLS,
    };
  }

  // Set default provider based on SANDBOX_PROVIDER env var
  if (env.SANDBOX_PROVIDER === "pve-lxc" || env.SANDBOX_PROVIDER === "pve-vm") {
    config.defaultProvider = env.SANDBOX_PROVIDER;
  } else if (env.SANDBOX_PROVIDER === "morph") {
    config.defaultProvider = "morph";
  }

  return config;
}

// Singleton registry instance
let registryInstance: ProviderRegistry | null = null;

/**
 * Get the sandbox provider registry, configured with www-env variables.
 * Uses a singleton pattern to reuse the same registry instance.
 */
export function getSandboxRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry(buildRegistryConfig());
  }
  return registryInstance;
}

/**
 * Create a new sandbox provider registry (non-singleton).
 * Use this when you need a fresh registry instance.
 */
export function createSandboxRegistry(): ProviderRegistry {
  return new ProviderRegistry(buildRegistryConfig());
}

/**
 * Get the active sandbox provider configuration.
 * This is the www-specific wrapper around getActiveSandboxProvider.
 */
export function getActiveSandboxProviderFromEnv(): SandboxProviderConfig {
  return getActiveSandboxProvider(buildSandboxEnvVars());
}

/**
 * Check if Morph provider is available.
 */
export function isMorphAvailableFromEnv(): boolean {
  return isMorphAvailable(buildSandboxEnvVars());
}

/**
 * Check if Proxmox provider is available.
 */
export function isProxmoxAvailableFromEnv(): boolean {
  return isProxmoxAvailable(buildSandboxEnvVars());
}

/**
 * Get a list of available sandbox providers.
 */
export function getAvailableSandboxProvidersFromEnv(): SandboxProvider[] {
  return getAvailableSandboxProviders(buildSandboxEnvVars());
}

// Re-export types and utilities that don't need env bridging
export {
  type SandboxInstance,
  type SandboxProvider,
  type StartSandboxResult,
  type StartSandboxOptions,
  type HttpService,
  type ExecResult,
  type ExecOptions,
  isPveLxcInstanceId,
  isMorphInstanceId,
  detectProviderFromInstanceId,
  wrapMorphInstance,
  wrapPveLxcInstance,
} from "@cmux/sandbox-providers";
