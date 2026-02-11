import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  DEFAULT_PVE_LXC_SNAPSHOT_ID,
  MORPH_SNAPSHOT_PRESETS,
  PVE_LXC_SNAPSHOT_PRESETS,
} from "@cmux/shared";
import type { SandboxProvider } from "./types";

export function getDefaultSnapshotId(provider: SandboxProvider): string {
  switch (provider) {
    case "pve-lxc":
      return DEFAULT_PVE_LXC_SNAPSHOT_ID;
    case "pve-vm":
      return DEFAULT_MORPH_SNAPSHOT_ID;
    case "morph":
    default:
      return DEFAULT_MORPH_SNAPSHOT_ID;
  }
}

export function isKnownDefaultSnapshot(snapshotId: string): boolean {
  const isMorphSnapshot = MORPH_SNAPSHOT_PRESETS.some((preset) =>
    preset.versions.some((version) => version.snapshotId === snapshotId),
  );
  if (isMorphSnapshot) {
    return true;
  }

  return PVE_LXC_SNAPSHOT_PRESETS.some((preset) =>
    preset.versions.some((version) => version.snapshotId === snapshotId),
  );
}

export function resolveProviderForSnapshotId(snapshotId: string): SandboxProvider | null {
  const isMorphSnapshot = MORPH_SNAPSHOT_PRESETS.some((preset) =>
    preset.versions.some((version) => version.snapshotId === snapshotId),
  );
  const isPveSnapshot = PVE_LXC_SNAPSHOT_PRESETS.some((preset) =>
    preset.versions.some((version) => version.snapshotId === snapshotId),
  );

  if (isMorphSnapshot && !isPveSnapshot) {
    return "morph";
  }
  if (isPveSnapshot && !isMorphSnapshot) {
    return "pve-lxc";
  }
  return null;
}
