import { MorphCloudClient } from "morphcloud";
import { detectProviderFromInstanceId } from "./provider-detection";
import type { SandboxProvider, SandboxInstance } from "./types";
import { wrapMorphInstance } from "./morph/morph-adapter";
import {
  PveLxcClient,
  type PveLxcClientOptions,
  type PveLxcInstance,
  type StartContainerOptions,
} from "./pve-lxc/pve-lxc-client";
import { wrapPveLxcInstance } from "./pve-lxc/pve-lxc-adapter";

export interface MorphRegistryConfig {
  apiKey: string;
}

export interface ProviderRegistryConfig {
  morph?: MorphRegistryConfig;
  pveLxc?: PveLxcClientOptions;
}

export interface StartInstanceOptions {
  provider: SandboxProvider;
  snapshotId: string;
  templateVmid?: number;
  instanceId?: string;
  ttlSeconds?: number;
  ttlAction?: "pause" | "stop";
  metadata?: Record<string, string | undefined>;
}

export interface StartInstanceResult {
  instance: SandboxInstance;
  provider: SandboxProvider;
  rawPveLxcInstance?: PveLxcInstance;
}

function toMorphMetadata(
  metadata: Record<string, string | undefined> | undefined,
): Record<string, string> | undefined {
  if (!metadata) {
    return undefined;
  }
  const entries = Object.entries(metadata).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (entries.length === 0) {
    return undefined;
  }
  return Object.fromEntries(entries);
}

export class ProviderRegistry {
  private readonly config: ProviderRegistryConfig;
  private morphClient: MorphCloudClient | null = null;
  private pveLxcClient: PveLxcClient | null = null;

  constructor(config: ProviderRegistryConfig) {
    this.config = config;
  }

  private getMorphClient(): MorphCloudClient {
    if (!this.config.morph?.apiKey) {
      throw new Error("Morph provider is not configured");
    }
    if (!this.morphClient) {
      this.morphClient = new MorphCloudClient({ apiKey: this.config.morph.apiKey });
    }
    return this.morphClient;
  }

  getPveLxcClient(): PveLxcClient {
    if (!this.config.pveLxc?.apiUrl || !this.config.pveLxc?.apiToken) {
      throw new Error("PVE LXC provider is not configured");
    }
    if (!this.pveLxcClient) {
      this.pveLxcClient = new PveLxcClient(this.config.pveLxc);
    }
    return this.pveLxcClient;
  }

  async getInstance(instanceId: string): Promise<SandboxInstance> {
    const provider = detectProviderFromInstanceId(instanceId);

    if (provider === "pve-lxc") {
      const pveLxcInstance = await this.getPveLxcClient().instances.get({ instanceId });
      return wrapPveLxcInstance(pveLxcInstance);
    }

    if (provider === "morph") {
      const morphInstance = await this.getMorphClient().instances.get({ instanceId });
      return wrapMorphInstance(morphInstance);
    }

    throw new Error(`Cannot detect supported provider for instance id: ${instanceId}`);
  }

  async startInstance(options: StartInstanceOptions): Promise<StartInstanceResult> {
    if (options.provider === "pve-vm") {
      throw new Error("PVE VM provider is not supported yet");
    }

    if (options.provider === "pve-lxc") {
      const startOptions: StartContainerOptions = {
        snapshotId: options.snapshotId,
        templateVmid: options.templateVmid,
        instanceId: options.instanceId,
        ttlSeconds: options.ttlSeconds,
        ttlAction: options.ttlAction,
        metadata: options.metadata,
      };
      const pveLxcInstance = await this.getPveLxcClient().instances.start(startOptions);
      return {
        instance: wrapPveLxcInstance(pveLxcInstance),
        provider: "pve-lxc",
        rawPveLxcInstance: pveLxcInstance,
      };
    }

    const morphInstance = await this.getMorphClient().instances.start({
      snapshotId: options.snapshotId,
      ttlSeconds: options.ttlSeconds,
      ttlAction: options.ttlAction,
      metadata: toMorphMetadata(options.metadata),
    });

    return {
      instance: wrapMorphInstance(morphInstance),
      provider: "morph",
    };
  }
}
