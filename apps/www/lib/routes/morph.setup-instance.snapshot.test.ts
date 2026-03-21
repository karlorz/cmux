import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  DEFAULT_PVE_LXC_SNAPSHOT_ID,
  MORPH_SNAPSHOT_PRESETS,
  PVE_LXC_SNAPSHOT_PRESETS,
} from "@cmux/shared";
import { describe, expect, it } from "vitest";
import { normalizeSetupInstanceSnapshotId } from "./morph.setup-instance.snapshot";

function getFirstPreset<T>(presets: readonly T[], label: string): T {
  const preset = presets[0];
  if (!preset) {
    throw new Error(`Missing ${label} preset fixture`);
  }
  return preset;
}

describe("normalizeSetupInstanceSnapshotId", () => {
  it("resolves a pve-lxc preset id to its canonical snapshot id", () => {
    const preset = getFirstPreset(PVE_LXC_SNAPSHOT_PRESETS, "pve-lxc");

    expect(normalizeSetupInstanceSnapshotId("pve-lxc", preset.presetId)).toBe(
      preset.id,
    );
  });

  it("resolves a morph preset id to its canonical snapshot id", () => {
    const preset = getFirstPreset(MORPH_SNAPSHOT_PRESETS, "morph");

    expect(normalizeSetupInstanceSnapshotId("morph", preset.presetId)).toBe(
      preset.id,
    );
  });

  it("passes canonical snapshot ids through unchanged", () => {
    const preset = getFirstPreset(PVE_LXC_SNAPSHOT_PRESETS, "pve-lxc");

    expect(normalizeSetupInstanceSnapshotId("pve-lxc", preset.id)).toBe(
      preset.id,
    );
  });

  it("falls back to the provider default snapshot id when missing", () => {
    expect(normalizeSetupInstanceSnapshotId("pve-lxc")).toBe(
      DEFAULT_PVE_LXC_SNAPSHOT_ID,
    );
    expect(normalizeSetupInstanceSnapshotId("morph")).toBe(
      DEFAULT_MORPH_SNAPSHOT_ID,
    );
  });

  it("passes unknown non-preset strings through unchanged", () => {
    expect(
      normalizeSetupInstanceSnapshotId("pve-lxc", "not_a_known_snapshot"),
    ).toBe("not_a_known_snapshot");
  });
});
