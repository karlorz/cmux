/**
 * Provider Registry
 *
 * Unified registry for sandbox providers that handles automatic
 * provider detection and instance management.
 */

import { MorphCloudClient } from "morphcloud";
import type {
  SandboxInstance,
  SandboxProvider,
  StartSandboxOptions,
  StartSandboxResult,
} from "./types";
import { detectProviderFromInstanceId } from "./provider-detection";
import { wrapMorphInstance } from "./morph/morph-adapter";
import { PveLxcClient, wrapPveLxcInstance } from "./pve-lxc";

/**
 * Configuration for the Morph provider
 */
export interface MorphProviderConfig {
  apiKey: string;
}

/**
 * Configuration for the PVE LXC provider
 */
export interface PveLxcProviderConfig {
  apiUrl: string;
  apiToken: string;
  node?: string;
  publicDomain?: string;
  verifyTls?: boolean;
}

/**
 * Configuration for all providers in the registry
 */
export interface ProviderRegistryConfig {
  morph?: MorphProviderConfig;
  pveLxc?: PveLxcProviderConfig;
  /** Default provider to use when starting new instances */
  defaultProvider?: SandboxProvider;
}

/**
 * Provider Registry
 *
 * Provides a unified interface for managing sandbox instances across
 * different providers (Morph Cloud, PVE LXC).
 *
 * Key features:
 * - Automatic provider detection from instance ID
 * - Lazy initialization of provider clients
 * - Unified getInstance() and startInstance() methods
 *
 * @example
 * ```typescript
 * const registry = new ProviderRegistry({
 *   morph: { apiKey: env.MORPH_API_KEY },
 *   pveLxc: { apiUrl: env.PVE_API_URL, apiToken: env.PVE_API_TOKEN },
 * });
 *
 * // Automatically detects provider from instance ID
 * const instance = await registry.getInstance("morphvm_abc123"); // Uses Morph
 * const instance2 = await registry.getInstance("pvelxc-def456"); // Uses PVE LXC
 * ```
 */
export class ProviderRegistry {
  private config: ProviderRegistryConfig;
  private morphClient: MorphCloudClient | null = null;
  private pveLxcClient: PveLxcClient | null = null;

  constructor(config: ProviderRegistryConfig) {
    this.config = config;
  }

  /**
   * Get or create the Morph client
   */
  private getMorphClient(): MorphCloudClient {
    if (!this.config.morph) {
      throw new Error("Morph provider not configured");
    }
    if (!this.morphClient) {
      this.morphClient = new MorphCloudClient({ apiKey: this.config.morph.apiKey });
    }
    return this.morphClient;
  }

  /**
   * Get or create the PVE LXC client
   */
  private getPveLxcClient(): PveLxcClient {
    if (!this.config.pveLxc) {
      throw new Error("PVE LXC provider not configured");
    }
    if (!this.pveLxcClient) {
      this.pveLxcClient = new PveLxcClient({
        apiUrl: this.config.pveLxc.apiUrl,
        apiToken: this.config.pveLxc.apiToken,
        node: this.config.pveLxc.node,
        publicDomain: this.config.pveLxc.publicDomain,
        verifyTls: this.config.pveLxc.verifyTls,
      });
    }
    return this.pveLxcClient;
  }

  /**
   * Check if a provider is configured
   */
  isProviderConfigured(provider: SandboxProvider): boolean {
    switch (provider) {
      case "morph":
        return Boolean(this.config.morph?.apiKey);
      case "pve-lxc":
        return Boolean(this.config.pveLxc?.apiUrl && this.config.pveLxc?.apiToken);
      case "pve-vm":
        // Not yet implemented
        return false;
      default:
        return false;
    }
  }

  /**
   * Get the default provider based on configuration
   */
  getDefaultProvider(): SandboxProvider {
    if (this.config.defaultProvider && this.isProviderConfigured(this.config.defaultProvider)) {
      return this.config.defaultProvider;
    }
    // Default priority: morph > pve-lxc
    if (this.isProviderConfigured("morph")) {
      return "morph";
    }
    if (this.isProviderConfigured("pve-lxc")) {
      return "pve-lxc";
    }
    throw new Error("No sandbox provider configured");
  }

  /**
   * Get an existing sandbox instance by ID.
   * Automatically detects the provider from the instance ID prefix.
   *
   * @param instanceId - The instance ID (e.g., "morphvm_abc123" or "pvelxc-def456")
   * @returns The wrapped SandboxInstance
   */
  async getInstance(instanceId: string): Promise<SandboxInstance> {
    const provider = detectProviderFromInstanceId(instanceId);

    if (provider === "pve-lxc") {
      const client = this.getPveLxcClient();
      const instance = await client.instances.get({ instanceId });
      return wrapPveLxcInstance(instance);
    }

    if (provider === "morph") {
      const client = this.getMorphClient();
      const instance = await client.instances.get({ instanceId });
      return wrapMorphInstance(instance);
    }

    // Unknown provider - try to detect from configuration
    // Default to morph if both are configured (for backwards compatibility with
    // instances that may have non-standard prefixes)
    if (this.isProviderConfigured("morph")) {
      const client = this.getMorphClient();
      const instance = await client.instances.get({ instanceId });
      return wrapMorphInstance(instance);
    }

    throw new Error(`Cannot determine provider for instance ID: ${instanceId}`);
  }

  /**
   * Get an existing sandbox instance, returning null if not found.
   *
   * @param instanceId - The instance ID
   * @returns The wrapped SandboxInstance or null if not found
   */
  async getInstanceOrNull(instanceId: string): Promise<SandboxInstance | null> {
    try {
      return await this.getInstance(instanceId);
    } catch (error) {
      // Check for common "not found" error patterns
      const message = error instanceof Error ? error.message : String(error);
      if (
        message.includes("not found") ||
        message.includes("Unable to resolve VMID") ||
        message.includes("404")
      ) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Start a new sandbox instance.
   *
   * @param options - Options for starting the instance
   * @param provider - Optional provider override (defaults to registry's default)
   * @returns The start result with instance and service URLs
   */
  async startInstance(
    options: StartSandboxOptions,
    provider?: SandboxProvider
  ): Promise<StartSandboxResult> {
    const targetProvider = provider ?? this.getDefaultProvider();

    if (targetProvider === "pve-lxc") {
      const client = this.getPveLxcClient();
      const instance = await client.instances.start({
        snapshotId: options.snapshotId,
        templateVmid: options.templateVmid,
        instanceId: options.instanceId,
        ttlSeconds: options.ttlSeconds,
        ttlAction: options.ttlAction,
        metadata: options.metadata,
      });

      const wrapped = wrapPveLxcInstance(instance);
      const vscodeService = wrapped.networking.httpServices.find((s) => s.name === "vscode");
      const workerService = wrapped.networking.httpServices.find((s) => s.name === "worker");

      return {
        instance: wrapped,
        provider: "pve-lxc",
        vscodeService,
        workerService,
      };
    }

    if (targetProvider === "morph") {
      const client = this.getMorphClient();
      // Filter out undefined values from metadata (Morph requires Record<string, string>)
      const filteredMetadata = options.metadata
        ? Object.fromEntries(
            Object.entries(options.metadata).filter(
              (entry): entry is [string, string] => entry[1] !== undefined
            )
          )
        : undefined;
      // Note: Morph does not support custom instanceId on start - it generates one
      const instance = await client.instances.start({
        snapshotId: options.snapshotId,
        ttlSeconds: options.ttlSeconds,
        ttlAction: options.ttlAction,
        metadata: filteredMetadata,
      });

      const wrapped = wrapMorphInstance(instance);
      const vscodeService = wrapped.networking.httpServices.find((s) => s.name === "vscode");
      const workerService = wrapped.networking.httpServices.find((s) => s.name === "worker");

      return {
        instance: wrapped,
        provider: "morph",
        vscodeService,
        workerService,
      };
    }

    throw new Error(`Unsupported provider: ${targetProvider}`);
  }

  /**
   * Get the raw PVE LXC client for provider-specific operations.
   * Use with caution - prefer using the unified interface when possible.
   */
  getRawPveLxcClient(): PveLxcClient {
    return this.getPveLxcClient();
  }

  /**
   * Get the raw Morph client for provider-specific operations.
   * Use with caution - prefer using the unified interface when possible.
   */
  getRawMorphClient(): MorphCloudClient {
    return this.getMorphClient();
  }
}
