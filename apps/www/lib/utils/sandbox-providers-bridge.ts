import {
  ProviderRegistry,
  getActiveSandboxProvider as getActiveSandboxProviderFromConfig,
  getAvailableSandboxProviders as getAvailableSandboxProvidersFromConfig,
  isMorphAvailable as isMorphAvailableFromConfig,
  isProxmoxAvailable as isProxmoxAvailableFromConfig,
  type SandboxEnvVars,
  type SandboxProvider,
  type SandboxProviderConfig,
} from "@cmux/sandbox-providers";
import type { PveLxcClient } from "@cmux/sandbox-providers/pve-lxc";
import { env } from "./www-env";

let sandboxRegistry: ProviderRegistry | null = null;

function getSandboxEnvVars(): SandboxEnvVars {
  return {
    SANDBOX_PROVIDER: env.SANDBOX_PROVIDER,
    MORPH_API_KEY: env.MORPH_API_KEY,
    PVE_API_URL: env.PVE_API_URL,
    PVE_API_TOKEN: env.PVE_API_TOKEN,
    PVE_NODE: env.PVE_NODE,
  };
}

export function getActiveSandboxProvider(): SandboxProviderConfig {
  return getActiveSandboxProviderFromConfig(getSandboxEnvVars());
}

export function isMorphAvailable(): boolean {
  return isMorphAvailableFromConfig(getSandboxEnvVars());
}

export function isProxmoxAvailable(): boolean {
  return isProxmoxAvailableFromConfig(getSandboxEnvVars());
}

export function getAvailableSandboxProviders(): Array<"morph" | "pve-lxc"> {
  return getAvailableSandboxProvidersFromConfig(getSandboxEnvVars());
}

export function getSandboxRegistry(): ProviderRegistry {
  if (!sandboxRegistry) {
    sandboxRegistry = new ProviderRegistry({
      morph: env.MORPH_API_KEY ? { apiKey: env.MORPH_API_KEY } : undefined,
      pveLxc:
        env.PVE_API_URL && env.PVE_API_TOKEN
          ? {
            apiUrl: env.PVE_API_URL,
            apiToken: env.PVE_API_TOKEN,
            node: env.PVE_NODE,
            publicDomain: env.PVE_PUBLIC_DOMAIN,
            verifyTls: env.PVE_VERIFY_TLS,
          }
          : undefined,
    });
  }
  return sandboxRegistry;
}

export function getPveLxcClient(): PveLxcClient {
  return getSandboxRegistry().getPveLxcClient();
}

export function getActiveProviderName(): SandboxProvider {
  return getActiveSandboxProvider().provider;
}

export type { SandboxEnvVars, SandboxProvider, SandboxProviderConfig };
