"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import { DEFAULT_PVE_LXC_SNAPSHOT_ID } from "@cmux/shared/pve-lxc-snapshots";
import { PveLxcClient, type PveLxcInstance } from "@cmux/pve-lxc-client";

function parseVerifyTls(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  return value === "1" || value.toLowerCase() === "true";
}

function getPveLxcClient(): PveLxcClient {
  const apiUrl = process.env.PVE_API_URL;
  const apiToken = process.env.PVE_API_TOKEN;

  if (!apiUrl || !apiToken) {
    throw new Error("PVE_API_URL and PVE_API_TOKEN must be configured");
  }

  return new PveLxcClient({
    apiUrl,
    apiToken,
    node: process.env.PVE_NODE,
    publicDomain: process.env.PVE_PUBLIC_DOMAIN,
    verifyTls: parseVerifyTls(process.env.PVE_VERIFY_TLS),
  });
}

function extractNetworkingUrls(instance: PveLxcInstance): {
  vscodeUrl?: string;
  workerUrl?: string;
  vncUrl?: string;
} {
  const httpServices = instance.networking.httpServices;
  const vscodeService = httpServices.find((s) => s.port === 39378);
  const workerService = httpServices.find((s) => s.port === 39377);
  const vncService = httpServices.find((s) => s.port === 39380);

  return {
    vscodeUrl: vscodeService?.url,
    workerUrl: workerService?.url,
    vncUrl: vncService?.url,
  };
}

export const startInstance = internalAction({
  args: {
    templateId: v.optional(v.string()),
    ttlSeconds: v.optional(v.number()),
    metadata: v.optional(v.record(v.string(), v.string())),
    envs: v.optional(v.record(v.string(), v.string())),
  },
  handler: async (_ctx, args) => {
    const client = getPveLxcClient();
    const instance = await client.instances.start({
      snapshotId: args.templateId ?? DEFAULT_PVE_LXC_SNAPSHOT_ID,
      ttlSeconds: args.ttlSeconds ?? 60 * 60,
      ttlAction: "pause",
      metadata: args.metadata,
    });

    const { vscodeUrl, workerUrl, vncUrl } = extractNetworkingUrls(instance);

    return {
      instanceId: instance.id,
      status: instance.status,
      vscodeUrl,
      workerUrl,
      vncUrl,
    };
  },
});

export const getInstance = internalAction({
  args: {
    instanceId: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      const client = getPveLxcClient();
      const instance = await client.instances.get({ instanceId: args.instanceId });
      const { vscodeUrl, workerUrl, vncUrl } = extractNetworkingUrls(instance);

      return {
        instanceId: args.instanceId,
        status: instance.status,
        vscodeUrl,
        workerUrl,
        vncUrl,
      };
    } catch {
      return {
        instanceId: args.instanceId,
        status: "stopped",
        vscodeUrl: null,
        workerUrl: null,
        vncUrl: null,
      };
    }
  },
});

export const execCommand = internalAction({
  args: {
    instanceId: v.string(),
    command: v.string(),
  },
  handler: async (_ctx, args) => {
    try {
      const client = getPveLxcClient();
      const instance = await client.instances.get({ instanceId: args.instanceId });
      const result = await instance.exec(args.command);

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exit_code: result.exit_code,
      };
    } catch (err) {
      console.error("[pve_lxc_actions.execCommand] Error:", err);
      return {
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exit_code: 1,
      };
    }
  },
});

export const stopInstance = internalAction({
  args: {
    instanceId: v.string(),
  },
  handler: async (_ctx, args) => {
    const client = getPveLxcClient();
    const instance = await client.instances.get({ instanceId: args.instanceId });
    await instance.stop();

    return { stopped: true };
  },
});

export const extendTimeout = internalAction({
  args: {
    instanceId: v.string(),
    timeoutMs: v.optional(v.number()),
  },
  handler: async () => {
    // PVE LXC timeout extension is currently a no-op.
    return { extended: true };
  },
});
