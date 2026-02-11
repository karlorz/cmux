/**
 * @cmux/sandbox-providers
 *
 * Unified sandbox provider abstraction layer for cmux.
 * Supports Morph Cloud and PVE LXC providers with a consistent interface.
 */

// Core types
export type {
  ExecResult,
  ExecOptions,
  HttpService,
  SandboxNetworking,
  SandboxInstance,
  SandboxProvider,
  StartSandboxResult,
  StartSandboxOptions,
  SandboxProviderConfig,
  SandboxEnvVars,
} from "./types";

// Provider detection
export {
  isPveLxcInstanceId,
  isMorphInstanceId,
  detectProviderFromInstanceId,
  isMorphSnapshotId,
  isPveLxcSnapshotId,
  resolveProviderForSnapshotId,
} from "./provider-detection";

// Provider configuration
export {
  getActiveSandboxProvider,
  isMorphAvailable,
  isProxmoxAvailable,
  getAvailableSandboxProviders,
} from "./provider-config";

// Provider registry
export {
  ProviderRegistry,
  type ProviderRegistryConfig,
  type MorphProviderConfig,
  type PveLxcProviderConfig,
} from "./provider-registry";

// Morph adapter
export { wrapMorphInstance } from "./morph";

// PVE LXC exports
export {
  PveLxcClient,
  PveLxcInstance,
  createPveLxcClient,
  wrapPveLxcInstance,
  type ContainerMetadata,
  type ContainerNetworking,
  type ContainerStatus,
  type PveLxcClientOptions,
  type StartContainerOptions,
} from "./pve-lxc";
