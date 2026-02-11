/**
 * Provider Detection Utilities
 *
 * Functions to detect which sandbox provider an instance belongs to
 * based on instance ID prefixes or snapshot ID formats.
 */

import type { SandboxProvider } from "./types";

/**
 * Check if an instance ID belongs to a PVE LXC instance.
 * PVE LXC instances use "pvelxc-" or "cmux-" prefixes.
 */
export function isPveLxcInstanceId(instanceId: string): boolean {
  return (
    instanceId.startsWith("pvelxc-") ||
    instanceId.startsWith("cmux-")
  );
}

/**
 * Check if an instance ID belongs to a Morph instance.
 * Morph instances use "morphvm_" prefix.
 */
export function isMorphInstanceId(instanceId: string): boolean {
  return instanceId.startsWith("morphvm_");
}

/**
 * Detect the sandbox provider from an instance ID.
 * Returns null if the provider cannot be determined.
 */
export function detectProviderFromInstanceId(
  instanceId: string
): SandboxProvider | null {
  if (isPveLxcInstanceId(instanceId)) {
    return "pve-lxc";
  }
  if (isMorphInstanceId(instanceId)) {
    return "morph";
  }
  return null;
}

/**
 * Check if a snapshot ID belongs to Morph.
 * This requires checking against the MORPH_SNAPSHOT_PRESETS.
 */
export function isMorphSnapshotId(
  snapshotId: string,
  morphPresets: ReadonlyArray<{ versions: ReadonlyArray<{ snapshotId: string }> }>
): boolean {
  return morphPresets.some((preset) =>
    preset.versions.some((v) => v.snapshotId === snapshotId)
  );
}

/**
 * Check if a snapshot ID belongs to PVE LXC.
 * This requires checking against the PVE_LXC_SNAPSHOT_PRESETS.
 */
export function isPveLxcSnapshotId(
  snapshotId: string,
  pveLxcPresets: ReadonlyArray<{ versions: ReadonlyArray<{ snapshotId: string }> }>
): boolean {
  return pveLxcPresets.some((preset) =>
    preset.versions.some((v) => v.snapshotId === snapshotId)
  );
}

/**
 * Resolve the provider for a given snapshot ID.
 * Returns null if the snapshot doesn't match any known preset.
 */
export function resolveProviderForSnapshotId(
  snapshotId: string,
  morphPresets: ReadonlyArray<{ versions: ReadonlyArray<{ snapshotId: string }> }>,
  pveLxcPresets: ReadonlyArray<{ versions: ReadonlyArray<{ snapshotId: string }> }>
): SandboxProvider | null {
  const isMorph = isMorphSnapshotId(snapshotId, morphPresets);
  const isPveLxc = isPveLxcSnapshotId(snapshotId, pveLxcPresets);

  if (isMorph && !isPveLxc) {
    return "morph";
  }
  if (isPveLxc && !isMorph) {
    return "pve-lxc";
  }
  return null;
}
