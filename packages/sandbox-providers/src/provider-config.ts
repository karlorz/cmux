import type { SandboxProvider } from "./types";

export interface SandboxEnvVars {
  SANDBOX_PROVIDER?: SandboxProvider;
  MORPH_API_KEY?: string;
  PVE_API_URL?: string;
  PVE_API_TOKEN?: string;
  PVE_NODE?: string;
}

export interface SandboxProviderConfig {
  provider: SandboxProvider;
  apiKey?: string;
  apiUrl?: string;
  apiToken?: string;
  node?: string;
}

export function getActiveSandboxProvider(envVars: SandboxEnvVars): SandboxProviderConfig {
  const explicitProvider = envVars.SANDBOX_PROVIDER;

  if (explicitProvider === "pve-lxc") {
    if (!envVars.PVE_API_URL || !envVars.PVE_API_TOKEN) {
      throw new Error(
        "PVE provider selected but PVE_API_URL or PVE_API_TOKEN is not set.",
      );
    }
    return {
      provider: "pve-lxc",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
    };
  }

  if (explicitProvider === "pve-vm") {
    if (!envVars.PVE_API_URL || !envVars.PVE_API_TOKEN) {
      throw new Error(
        "SANDBOX_PROVIDER=pve-vm but PVE_API_URL or PVE_API_TOKEN is not set.",
      );
    }
    return {
      provider: "pve-vm",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
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

  if (envVars.MORPH_API_KEY) {
    return {
      provider: "morph",
      apiKey: envVars.MORPH_API_KEY,
    };
  }

  if (envVars.PVE_API_URL && envVars.PVE_API_TOKEN) {
    return {
      provider: "pve-lxc",
      apiUrl: envVars.PVE_API_URL,
      apiToken: envVars.PVE_API_TOKEN,
      node: envVars.PVE_NODE,
    };
  }

  throw new Error(
    "No sandbox provider configured. Set either MORPH_API_KEY or (PVE_API_URL + PVE_API_TOKEN).",
  );
}

export function isMorphAvailable(envVars: SandboxEnvVars): boolean {
  return Boolean(envVars.MORPH_API_KEY);
}

export function isProxmoxAvailable(envVars: SandboxEnvVars): boolean {
  return Boolean(envVars.PVE_API_URL && envVars.PVE_API_TOKEN);
}

export function getAvailableSandboxProviders(envVars: SandboxEnvVars): Array<"morph" | "pve-lxc"> {
  const providers: Array<"morph" | "pve-lxc"> = [];
  if (isMorphAvailable(envVars)) {
    providers.push("morph");
  }
  if (isProxmoxAvailable(envVars)) {
    providers.push("pve-lxc");
  }
  return providers;
}
