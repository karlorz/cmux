// Canonical tuples - single source of truth for sandbox-related providers.
export const RUNTIME_PROVIDERS = [
  "docker",
  "morph",
  "e2b",
  "daytona",
  "pve-lxc",
  "other",
] as const;

export const SNAPSHOT_PROVIDERS = [...RUNTIME_PROVIDERS, "pve-vm"] as const;

export const DEVBOX_PROVIDERS = [
  "morph",
  "e2b",
  "modal",
  "daytona",
  "pve-lxc",
] as const;

export const CONFIG_PROVIDERS = ["morph", "pve-lxc", "pve-vm"] as const;

export type RuntimeProvider = (typeof RUNTIME_PROVIDERS)[number];
export type SnapshotProvider = (typeof SNAPSHOT_PROVIDERS)[number];
export type DevboxProvider = (typeof DEVBOX_PROVIDERS)[number];
export type ConfigProvider = (typeof CONFIG_PROVIDERS)[number];

// Backward-compatible aliases for existing call sites.
export type VSCodeProvider = RuntimeProvider;
export type SandboxProvider = RuntimeProvider;
