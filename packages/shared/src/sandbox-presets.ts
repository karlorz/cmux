/**
 * Unified sandbox preset types for all providers.
 *
 * This module provides a common interface for sandbox presets that can be
 * used across different providers (Morph, PVE LXC, PVE VM, etc.).
 *
 * When adding a new provider:
 * 1. Add the provider type to SandboxProviderType
 * 2. Add capabilities to SandboxProviderCapabilities
 * 3. Create a mapping function in the provider's module
 */

/**
 * Supported sandbox provider types.
 * Add new providers here as they are implemented.
 */
export type SandboxProviderType = "morph" | "pve-lxc" | "pve-vm";

/**
 * Display names for providers (for UI)
 */
export const SANDBOX_PROVIDER_DISPLAY_NAMES: Record<SandboxProviderType, string> = {
  morph: "Morph Cloud",
  "pve-lxc": "Proxmox LXC",
  "pve-vm": "Proxmox VM",
};

/**
 * Capabilities that a sandbox provider may support.
 * Used by frontend to show/hide features based on provider capabilities.
 */
export interface SandboxProviderCapabilities {
  /** Provider supports pausing/resuming with RAM state preservation */
  supportsHibernate: boolean;
  /** Provider supports live snapshots */
  supportsSnapshots: boolean;
  /** Provider supports resizing resources after creation */
  supportsResize: boolean;
  /** Provider supports nested virtualization */
  supportsNestedVirt: boolean;
  /** Provider supports GPU passthrough */
  supportsGpu: boolean;
}

/**
 * Default capabilities by provider type
 */
export const SANDBOX_PROVIDER_CAPABILITIES: Record<SandboxProviderType, SandboxProviderCapabilities> = {
  morph: {
    supportsHibernate: true,
    supportsSnapshots: true,
    supportsResize: false,
    supportsNestedVirt: false,
    supportsGpu: false,
  },
  "pve-lxc": {
    supportsHibernate: false, // LXC doesn't support true hibernate, only stop/start
    supportsSnapshots: true,
    supportsResize: true,
    supportsNestedVirt: false,
    supportsGpu: false,
  },
  "pve-vm": {
    supportsHibernate: true, // QEMU VMs support hibernate/suspend to disk
    supportsSnapshots: true,
    supportsResize: true,
    supportsNestedVirt: true,
    supportsGpu: true,
  },
};

/**
 * A unified sandbox preset that works across all providers.
 * This is the common format returned by the API.
 */
export interface SandboxPreset {
  /** Unique identifier for this preset (provider-specific format) */
  id: string;
  /** Preset identifier in format: <cpu>_<memory>_<disk> */
  presetId: string;
  /** Human-readable label (e.g., "Standard workspace") */
  label: string;
  /** CPU description (e.g., "4 vCPU") */
  cpu: string;
  /** Memory description (e.g., "16 GB RAM") */
  memory: string;
  /** Disk description (e.g., "48 GB SSD") */
  disk: string;
  /** Optional description for this preset */
  description?: string;
}

/**
 * Configuration returned by the sandbox config API endpoint.
 */
export interface SandboxConfig {
  /** The active provider type */
  provider: SandboxProviderType;
  /** Display name for the provider */
  providerDisplayName: string;
  /** Available presets for the active provider */
  presets: SandboxPreset[];
  /** Default preset ID to use */
  defaultPresetId: string;
  /** Provider capabilities */
  capabilities: SandboxProviderCapabilities;
}

/**
 * Preset IDs that should be shown in the environment creation UI.
 * These are the "standard" and "performance" tiers.
 */
export const UI_VISIBLE_PRESET_IDS = ["4vcpu_16gb_48gb", "8vcpu_32gb_48gb"] as const;

/**
 * Filter presets to only show UI-visible ones
 */
export function filterVisiblePresets(presets: SandboxPreset[]): SandboxPreset[] {
  return presets.filter((p) =>
    (UI_VISIBLE_PRESET_IDS as readonly string[]).includes(p.presetId)
  );
}
