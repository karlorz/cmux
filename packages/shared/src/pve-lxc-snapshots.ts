import { z } from "zod";
import pveLxcSnapshotDataJson from "./pve-lxc-snapshots.json" with {
  type: "json",
};

const isoDateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Invalid ISO date string",
  });

const presetIdSchema = z
  .string()
  .regex(/^[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/i, {
    message: "presetId must follow <cpu>_<memory>_<disk> format",
  });

export const pveLxcSnapshotVersionSchema = z.object({
  version: z.number().int().positive(),
  vmid: z.number().int().positive(),
  snapshotName: z.string(),
  capturedAt: isoDateStringSchema,
});

export const pveLxcSnapshotPresetSchema = z
  .object({
    presetId: presetIdSchema,
    label: z.string(),
    cpu: z.string(),
    memory: z.string(),
    disk: z.string(),
    description: z.string().optional(),
    versions: z.array(pveLxcSnapshotVersionSchema).min(1).readonly(),
  })
  .superRefine((preset, ctx) => {
    const sortedByVersion = [...preset.versions].sort(
      (a, b) => a.version - b.version,
    );
    for (let index = 1; index < sortedByVersion.length; index += 1) {
      const previous = sortedByVersion[index - 1];
      const current = sortedByVersion[index];
      if (!previous || !current) {
        continue;
      }
      if (current.version <= previous.version) {
        ctx.addIssue({
          code: "custom",
          message: "Versions must be strictly increasing",
          path: ["versions", index, "version"],
        });
        break;
      }
    }
  });

export const pveLxcSnapshotManifestSchema = z.object({
  schemaVersion: z.number().int().positive(),
  updatedAt: isoDateStringSchema,
  templateVmid: z.number().int().positive(),
  node: z.string(),
  presets: z.array(pveLxcSnapshotPresetSchema).min(1),
});

export type PveLxcSnapshotVersion = z.infer<typeof pveLxcSnapshotVersionSchema>;

export type PveLxcSnapshotPreset = z.infer<typeof pveLxcSnapshotPresetSchema>;

export interface PveLxcSnapshotPresetWithLatest extends PveLxcSnapshotPreset {
  /** Unique identifier combining vmid and snapshot name */
  id: string;
  latestVersion: PveLxcSnapshotVersion;
  versions: readonly PveLxcSnapshotVersion[];
}

export type PveLxcSnapshotManifest = z.infer<typeof pveLxcSnapshotManifestSchema>;

const sortVersions = (
  versions: readonly PveLxcSnapshotVersion[],
): PveLxcSnapshotVersion[] => [...versions].sort((a, b) => a.version - b.version);

const toPresetWithLatest = (
  preset: PveLxcSnapshotPreset,
): PveLxcSnapshotPresetWithLatest => {
  const sortedVersions = sortVersions(preset.versions);
  const latestVersion = sortedVersions.length > 0 ? sortedVersions[sortedVersions.length - 1] : undefined;
  if (!latestVersion) {
    throw new Error(`Preset "${preset.presetId}" does not contain versions`);
  }
  // Create a unique ID from vmid and snapshot name
  const id = `pve_${latestVersion.vmid}_${latestVersion.snapshotName}`;
  return {
    ...preset,
    versions: sortedVersions,
    id,
    latestVersion,
  };
};

const pveLxcSnapshotManifest =
  pveLxcSnapshotManifestSchema.parse(pveLxcSnapshotDataJson);

export const PVE_LXC_SNAPSHOT_MANIFEST: PveLxcSnapshotManifest =
  pveLxcSnapshotManifest;

const pveLxcSnapshotPresets =
  PVE_LXC_SNAPSHOT_MANIFEST.presets.map(toPresetWithLatest);

export const PVE_LXC_SNAPSHOT_PRESETS: readonly PveLxcSnapshotPresetWithLatest[] =
  pveLxcSnapshotPresets;

if (PVE_LXC_SNAPSHOT_PRESETS.length === 0) {
  throw new Error("PVE LXC snapshot manifest must include at least one preset");
}

export type PveLxcSnapshotId =
  (typeof PVE_LXC_SNAPSHOT_PRESETS)[number]["id"];

const firstPreset = PVE_LXC_SNAPSHOT_PRESETS[0];

if (!firstPreset) {
  throw new Error("PVE LXC snapshot manifest must include a default preset");
}

export const DEFAULT_PVE_LXC_SNAPSHOT_ID: PveLxcSnapshotId = firstPreset.id;

/**
 * Get the latest snapshot for a given preset ID.
 */
export const getPveLxcSnapshotByPresetId = (
  presetId: string,
): PveLxcSnapshotPresetWithLatest | undefined => {
  return PVE_LXC_SNAPSHOT_PRESETS.find((p) => p.presetId === presetId);
};

/**
 * Get the latest snapshot ID for a given preset ID.
 */
export const getPveLxcSnapshotIdByPresetId = (
  presetId: string,
): PveLxcSnapshotId | undefined => {
  const preset = getPveLxcSnapshotByPresetId(presetId);
  return preset?.id;
};
