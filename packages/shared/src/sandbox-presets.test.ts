import { describe, expect, it } from "vitest";
import {
  SANDBOX_PROVIDER_DISPLAY_NAMES,
  SANDBOX_PROVIDER_CAPABILITIES,
  UI_VISIBLE_PRESET_IDS,
  UI_VISIBLE_PRESET_IDS_BY_PROVIDER,
  filterVisiblePresets,
  resolveSnapshotId,
  type SandboxPreset,
  type SandboxProviderType,
} from "./sandbox-presets";

describe("SANDBOX_PROVIDER_DISPLAY_NAMES", () => {
  it("has display names for all providers", () => {
    expect(SANDBOX_PROVIDER_DISPLAY_NAMES.morph).toBe("Morph Cloud");
    expect(SANDBOX_PROVIDER_DISPLAY_NAMES["pve-lxc"]).toBe("Proxmox LXC");
    expect(SANDBOX_PROVIDER_DISPLAY_NAMES["pve-vm"]).toBe("Proxmox VM");
  });
});

describe("SANDBOX_PROVIDER_CAPABILITIES", () => {
  it("has capabilities for morph provider", () => {
    const caps = SANDBOX_PROVIDER_CAPABILITIES.morph;
    expect(caps.supportsHibernate).toBe(true);
    expect(caps.supportsSnapshots).toBe(true);
    expect(caps.supportsResize).toBe(false);
  });

  it("has capabilities for pve-lxc provider", () => {
    const caps = SANDBOX_PROVIDER_CAPABILITIES["pve-lxc"];
    expect(caps.supportsHibernate).toBe(false);
    expect(caps.supportsSnapshots).toBe(true);
    expect(caps.supportsResize).toBe(true);
  });

  it("has capabilities for pve-vm provider", () => {
    const caps = SANDBOX_PROVIDER_CAPABILITIES["pve-vm"];
    expect(caps.supportsHibernate).toBe(true);
    expect(caps.supportsSnapshots).toBe(true);
    expect(caps.supportsNestedVirt).toBe(true);
    expect(caps.supportsGpu).toBe(true);
  });
});

describe("UI_VISIBLE_PRESET_IDS_BY_PROVIDER", () => {
  it("has preset IDs for morph provider", () => {
    expect(UI_VISIBLE_PRESET_IDS_BY_PROVIDER.morph.length).toBeGreaterThan(0);
    expect(UI_VISIBLE_PRESET_IDS_BY_PROVIDER.morph).toContain("4vcpu_8gb_32gb");
  });

  it("has preset IDs for pve-lxc provider", () => {
    expect(UI_VISIBLE_PRESET_IDS_BY_PROVIDER["pve-lxc"].length).toBeGreaterThan(0);
  });
});

describe("UI_VISIBLE_PRESET_IDS", () => {
  it("contains all preset IDs from all providers", () => {
    for (const presetId of UI_VISIBLE_PRESET_IDS_BY_PROVIDER.morph) {
      expect(UI_VISIBLE_PRESET_IDS).toContain(presetId);
    }
    for (const presetId of UI_VISIBLE_PRESET_IDS_BY_PROVIDER["pve-lxc"]) {
      expect(UI_VISIBLE_PRESET_IDS).toContain(presetId);
    }
  });
});

describe("filterVisiblePresets", () => {
  it("returns empty array for empty input", () => {
    expect(filterVisiblePresets([])).toEqual([]);
  });

  it("filters out non-visible presets", () => {
    const presets: SandboxPreset[] = [
      {
        id: "1",
        presetId: "4vcpu_8gb_32gb",
        label: "Standard",
        cpu: "4 vCPU",
        memory: "8 GB",
        disk: "32 GB",
      },
      {
        id: "2",
        presetId: "unknown_preset_id",
        label: "Unknown",
        cpu: "2 vCPU",
        memory: "4 GB",
        disk: "16 GB",
      },
    ];

    const filtered = filterVisiblePresets(presets);
    expect(filtered.length).toBe(1);
    expect(filtered[0].presetId).toBe("4vcpu_8gb_32gb");
  });

  it("keeps all visible presets", () => {
    const presets: SandboxPreset[] = [
      {
        id: "1",
        presetId: "4vcpu_8gb_32gb",
        label: "Standard",
        cpu: "4 vCPU",
        memory: "8 GB",
        disk: "32 GB",
      },
      {
        id: "2",
        presetId: "4vcpu_16gb_48gb",
        label: "Performance",
        cpu: "4 vCPU",
        memory: "16 GB",
        disk: "48 GB",
      },
    ];

    const filtered = filterVisiblePresets(presets);
    expect(filtered.length).toBe(2);
  });
});

describe("resolveSnapshotId", () => {
  it("resolves morph snapshot IDs", async () => {
    const { MORPH_SNAPSHOT_PRESETS } = await import("./morph-snapshots");
    const firstSnapshot = MORPH_SNAPSHOT_PRESETS[0]?.versions[0];

    if (firstSnapshot) {
      const resolved = await resolveSnapshotId(firstSnapshot.snapshotId, "morph");
      expect(resolved.provider).toBe("morph");
      expect(resolved.snapshotId).toBe(firstSnapshot.snapshotId);
      expect(resolved.version).toBe(firstSnapshot.version);
    }
  });

  it("resolves pve-lxc snapshot IDs", async () => {
    const { PVE_LXC_SNAPSHOT_PRESETS } = await import("./pve-lxc-snapshots");
    const firstSnapshot = PVE_LXC_SNAPSHOT_PRESETS[0]?.versions[0];

    if (firstSnapshot) {
      const resolved = await resolveSnapshotId(firstSnapshot.snapshotId, "pve-lxc");
      expect(resolved.provider).toBe("pve-lxc");
      expect(resolved.snapshotId).toBe(firstSnapshot.snapshotId);
      expect(resolved.templateVmid).toBe(firstSnapshot.templateVmid);
    }
  });

  it("throws for unknown morph snapshot", async () => {
    await expect(
      resolveSnapshotId("snapshot_nonexistent", "morph")
    ).rejects.toThrow("Morph snapshot not found");
  });

  it("throws for unknown pve-lxc snapshot", async () => {
    await expect(
      resolveSnapshotId("snapshot_nonexistent", "pve-lxc")
    ).rejects.toThrow("PVE LXC snapshot not found");
  });

  it("throws for pve-vm provider (not implemented)", async () => {
    await expect(
      resolveSnapshotId("snapshot_test", "pve-vm")
    ).rejects.toThrow("PVE VM provider not yet implemented");
  });
});
