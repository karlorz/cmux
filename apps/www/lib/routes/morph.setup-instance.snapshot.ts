import {
  DEFAULT_MORPH_SNAPSHOT_ID,
  DEFAULT_PVE_LXC_SNAPSHOT_ID,
  getPveLxcSnapshotIdByPresetId,
  getSnapshotIdByPresetId,
} from "@cmux/shared";

const CANONICAL_SNAPSHOT_ID_PATTERN = /^snapshot_[a-z0-9]+$/i;

function getDefaultSnapshotId(provider: string): string {
  switch (provider) {
    case "pve-lxc":
      return DEFAULT_PVE_LXC_SNAPSHOT_ID;
    case "morph":
    default:
      return DEFAULT_MORPH_SNAPSHOT_ID;
  }
}

export function normalizeSetupInstanceSnapshotId(
  provider: string,
  snapshotId?: string,
): string {
  if (!snapshotId) {
    return getDefaultSnapshotId(provider);
  }

  if (CANONICAL_SNAPSHOT_ID_PATTERN.test(snapshotId)) {
    return snapshotId;
  }

  if (provider === "pve-lxc") {
    return getPveLxcSnapshotIdByPresetId(snapshotId) ?? snapshotId;
  }

  if (provider === "morph") {
    return getSnapshotIdByPresetId(snapshotId) ?? snapshotId;
  }

  return snapshotId;
}
