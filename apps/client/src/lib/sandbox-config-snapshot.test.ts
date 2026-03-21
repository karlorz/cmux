import {
  MORPH_SNAPSHOT_PRESETS,
  SANDBOX_PROVIDER_CAPABILITIES,
  SANDBOX_PROVIDER_DISPLAY_NAMES,
  type SandboxConfig,
  type SandboxPreset,
  type SandboxProviderType,
} from "@cmux/shared";
import { describe, expect, it } from "vitest";
import { resolveCanonicalSandboxSnapshotId } from "./sandbox-config-snapshot";

function getFirstPreset<T>(presets: readonly T[], label: string): T {
  const preset = presets[0];
  if (!preset) {
    throw new Error(`Missing ${label} preset fixture`);
  }
  return preset;
}

function createSandboxConfig(
  provider: SandboxProviderType,
  presets: readonly SandboxPreset[],
): SandboxConfig {
  const defaultPreset = getFirstPreset(presets, provider);

  return {
    provider,
    providerDisplayName: SANDBOX_PROVIDER_DISPLAY_NAMES[provider],
    presets: [...presets],
    defaultPresetId: defaultPreset.presetId,
    capabilities: SANDBOX_PROVIDER_CAPABILITIES[provider],
  };
}

describe("resolveCanonicalSandboxSnapshotId", () => {
  const presets = MORPH_SNAPSHOT_PRESETS.slice(0, 2);
  const config = createSandboxConfig("morph", presets);
  const firstPreset = getFirstPreset(presets, "morph");

  it("resolves defaultPresetId to the matching canonical snapshot id", () => {
    expect(resolveCanonicalSandboxSnapshotId(config)).toBe(firstPreset.id);
  });

  it("resolves a stale preset id input to the matching canonical snapshot id", () => {
    expect(resolveCanonicalSandboxSnapshotId(config, firstPreset.presetId)).toBe(
      firstPreset.id,
    );
  });

  it("keeps canonical snapshot ids unchanged", () => {
    expect(resolveCanonicalSandboxSnapshotId(config, firstPreset.id)).toBe(
      firstPreset.id,
    );
  });
});
