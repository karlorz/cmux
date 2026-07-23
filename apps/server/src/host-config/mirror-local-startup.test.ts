import { describe, expect, it, vi } from "vitest";
import type { MirrorLocalPack } from "./mirror-local-pack";
import {
  runMirrorLocalStartup,
  type MirrorLocalHostService,
} from "./mirror-local-startup";

const pack: MirrorLocalPack = {
  archive: Buffer.from("pack"),
  sha256: "b".repeat(64),
  policyVersion: "cmux-mirror-local/v1",
  fileCount: 3,
  expandedBytes: 4,
  compressedBytes: 4,
};

describe("runMirrorLocalStartup", () => {
  it("starts one sandbox and applies the pack to that exact PVE LXC instance", async () => {
    const startSandbox = vi.fn(async () => ({
      instanceId: "pvelxc-exact",
      provider: "pve-lxc",
    }));
    const applyPack = vi.fn(
      async ({
        onProgress,
      }: {
        onProgress: (state: "uploading" | "applying") => void;
      }) => {
        onProgress("uploading");
        onProgress("applying");
      },
    );
    const states: string[] = [];

    const result = await runMirrorLocalStartup({
      hostService: { createPack: async () => pack },
      startSandbox,
      applyPack,
      onProgress: (progress) => states.push(progress.state),
    });

    expect(startSandbox).toHaveBeenCalledTimes(1);
    expect(applyPack).toHaveBeenCalledWith({
      instanceId: "pvelxc-exact",
      pack,
      onProgress: expect.any(Function),
    });
    expect(result.state).toBe("applied");
    expect(states).toEqual([
      "packing",
      "starting-sandbox",
      "uploading",
      "applying",
      "applied",
    ]);
  });

  it("starts a usable clean sandbox when packing fails", async () => {
    const hostService: MirrorLocalHostService = {
      createPack: async () => {
        throw new Error("host config unreadable");
      },
    };
    const startSandbox = vi.fn(async () => ({
      instanceId: "pvelxc-clean",
      provider: "pve-lxc",
    }));
    const applyPack = vi.fn(async () => undefined);

    const result = await runMirrorLocalStartup({
      hostService,
      startSandbox,
      applyPack,
    });

    expect(startSandbox).toHaveBeenCalledTimes(1);
    expect(applyPack).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      state: "failed",
      instanceId: "pvelxc-clean",
      provider: "pve-lxc",
      errorCode: "pack-failed",
    });
  });

  it("does not apply a pack when the actual provider is unsupported", async () => {
    const applyPack = vi.fn(async () => undefined);
    const result = await runMirrorLocalStartup({
      hostService: { createPack: async () => pack },
      startSandbox: async () => ({
        instanceId: "morph-123",
        provider: "morph",
      }),
      applyPack,
    });

    expect(applyPack).not.toHaveBeenCalled();
    expect(result.state).toBe("unsupported");
    expect(result.provider).toBe("morph");
  });

  it("rejects Mirror local before sandbox creation without a trusted host service", async () => {
    const startSandbox = vi.fn(async () => ({
      instanceId: "must-not-start",
      provider: "pve-lxc",
    }));

    await expect(
      runMirrorLocalStartup({
        startSandbox,
        applyPack: async () => undefined,
      }),
    ).rejects.toThrow(/trusted Electron host service/i);
    expect(startSandbox).not.toHaveBeenCalled();
  });
});
