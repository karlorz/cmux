/**
 * Centralized Provider Types - Single Source of Truth
 *
 * This module defines all provider type constants and derives TypeScript types
 * from them. All other locations in the codebase should import from here rather
 * than defining their own provider type unions.
 *
 * Provider Categories:
 * - Runtime: Providers for VSCode instances, sandbox activity, socket events
 * - Snapshot: Runtime providers + pve-vm (for environment snapshots)
 * - Devbox: Providers for devbox provisioning (devboxInfo, devboxInstances)
 * - Config: Providers for sandbox config API, preset selection
 */

// =============================================================================
// Canonical Tuples - THE source of truth
// =============================================================================

/**
 * Runtime providers used for VSCode instances, sandbox activity, and socket events.
 * These are the providers that can host a running sandbox.
 */
export const RUNTIME_PROVIDERS = [
  "docker",
  "morph",
  "daytona",
  "pve-lxc",
  "other",
] as const;

/**
 * Snapshot providers extend runtime providers with pve-vm.
 * Used in environments and sandboxInstanceActivity for snapshot provider tracking.
 */
export const SNAPSHOT_PROVIDERS = [
  ...RUNTIME_PROVIDERS,
  "pve-vm",
] as const;

/**
 * Devbox providers for devbox provisioning.
 * These are the providers supported by the devbox v2 API.
 */
export const DEVBOX_PROVIDERS = [
  "morph",
  "e2b",
  "modal",
  "daytona",
  "pve-lxc",
] as const;

/**
 * Config providers for sandbox configuration API and preset selection.
 * These are the providers that have configurable presets.
 */
export const CONFIG_PROVIDERS = [
  "morph",
  "pve-lxc",
  "pve-vm",
] as const;

// =============================================================================
// Derived TypeScript Types
// =============================================================================

/** Runtime provider type - for VSCode instances, sandbox activity, socket events */
export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];

/** Snapshot provider type - runtime providers + pve-vm */
export type SnapshotProvider = (typeof SNAPSHOT_PROVIDERS)[number];

/** Devbox provider type - for devbox provisioning */
export type DevboxProvider = (typeof DEVBOX_PROVIDERS)[number];

/** Config provider type - for sandbox config API */
export type ConfigProvider = (typeof CONFIG_PROVIDERS)[number];

// =============================================================================
// Type Aliases for Backward Compatibility
// =============================================================================

/** @deprecated Use RuntimeProvider instead */
export type VSCodeProvider = RuntimeProvider;

/** @deprecated Use RuntimeProvider instead */
export type SandboxProvider = RuntimeProvider;

// =============================================================================
// Type Guards
// =============================================================================

/** Check if a string is a valid runtime provider */
export function isRuntimeProvider(value: string): value is RuntimeProvider {
  return (RUNTIME_PROVIDERS as readonly string[]).includes(value);
}

/** Check if a string is a valid snapshot provider */
export function isSnapshotProvider(value: string): value is SnapshotProvider {
  return (SNAPSHOT_PROVIDERS as readonly string[]).includes(value);
}

/** Check if a string is a valid devbox provider */
export function isDevboxProvider(value: string): value is DevboxProvider {
  return (DEVBOX_PROVIDERS as readonly string[]).includes(value);
}

/** Check if a string is a valid config provider */
export function isConfigProvider(value: string): value is ConfigProvider {
  return (CONFIG_PROVIDERS as readonly string[]).includes(value);
}
