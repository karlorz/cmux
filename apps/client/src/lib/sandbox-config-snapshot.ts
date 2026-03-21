interface SandboxSnapshotPreset {
  id: string;
  presetId: string;
}

interface SandboxSnapshotConfig {
  presets: readonly SandboxSnapshotPreset[];
  defaultPresetId?: string;
}

const CANONICAL_SNAPSHOT_ID_PATTERN = /^snapshot_[a-z0-9]+$/i;

function findMatchingPreset(
  config: SandboxSnapshotConfig,
  value: string,
): SandboxSnapshotPreset | undefined {
  return config.presets.find(
    (preset) => preset.id === value || preset.presetId === value,
  );
}

export function resolveCanonicalSandboxSnapshotId(
  config: SandboxSnapshotConfig,
  snapshotId?: string,
): string | undefined {
  const candidate = snapshotId ?? config.defaultPresetId;
  if (!candidate) {
    return undefined;
  }

  if (CANONICAL_SNAPSHOT_ID_PATTERN.test(candidate)) {
    return candidate;
  }

  return findMatchingPreset(config, candidate)?.id ?? candidate;
}
