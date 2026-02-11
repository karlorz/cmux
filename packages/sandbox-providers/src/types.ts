/**
 * Sandbox Provider Types
 *
 * Core types for the unified sandbox provider abstraction layer.
 * These types allow seamless switching between different sandbox providers
 * (Morph Cloud, PVE LXC, etc.) with a consistent interface.
 */

/**
 * Result of command execution
 */
export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

/**
 * Options for executing commands inside a sandbox
 */
export interface ExecOptions {
  /** Maximum runtime for the command in milliseconds */
  timeoutMs?: number;
}

/**
 * HTTP service exposed by the sandbox
 */
export interface HttpService {
  name: string;
  port: number;
  url: string;
}

/**
 * Sandbox networking configuration
 */
export interface SandboxNetworking {
  httpServices: HttpService[];
}

/**
 * Unified sandbox instance interface
 */
export interface SandboxInstance {
  /** Unique instance identifier */
  id: string;

  /** Current status */
  status: string;

  /** Instance metadata */
  metadata: Record<string, string | undefined>;

  /** Networking configuration */
  networking: SandboxNetworking;

  /** Execute a command inside the sandbox */
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;

  /** Stop the sandbox */
  stop(): Promise<void>;

  /** Pause the sandbox */
  pause(): Promise<void>;

  /** Resume the sandbox */
  resume(): Promise<void>;

  /** Expose an HTTP service */
  exposeHttpService(name: string, port: number): Promise<void>;

  /** Hide an HTTP service */
  hideHttpService(name: string): Promise<void>;

  /** Set wake-on behavior (Morph-specific, no-op for PVE) */
  setWakeOn(http: boolean, ssh: boolean): Promise<void>;
}

/**
 * Provider type
 */
export type SandboxProvider = "morph" | "pve-lxc" | "pve-vm";

/**
 * Result of starting a sandbox
 */
export interface StartSandboxResult {
  instance: SandboxInstance;
  provider: SandboxProvider;
  vscodeService: HttpService | undefined;
  workerService: HttpService | undefined;
}

/**
 * Options for starting a sandbox instance
 */
export interface StartSandboxOptions {
  /** Snapshot ID to clone from */
  snapshotId: string;
  /** Template VMID (PVE-specific, optional) */
  templateVmid?: number;
  /** Custom instance ID (optional, auto-generated if not provided) */
  instanceId?: string;
  /** Time-to-live in seconds */
  ttlSeconds?: number;
  /** Action to take when TTL expires */
  ttlAction?: "pause" | "stop";
  /** Metadata to attach to the instance */
  metadata?: Record<string, string | undefined>;
}

/**
 * Configuration for sandbox provider credentials
 */
export interface SandboxProviderConfig {
  provider: SandboxProvider;
  /** For Morph: API key */
  apiKey?: string;
  /** For Proxmox: API URL */
  apiUrl?: string;
  /** For Proxmox: API token */
  apiToken?: string;
  /** For Proxmox: node name */
  node?: string;
  /** For Proxmox: public domain for Cloudflare Tunnel */
  publicDomain?: string;
  /** For Proxmox: whether to verify TLS */
  verifyTls?: boolean;
}

/**
 * Environment variables for sandbox provider configuration.
 * Used by getActiveSandboxProvider to determine which provider to use.
 */
export interface SandboxEnvVars {
  SANDBOX_PROVIDER?: "morph" | "pve-lxc" | "pve-vm";
  MORPH_API_KEY?: string;
  PVE_API_URL?: string;
  PVE_API_TOKEN?: string;
  PVE_NODE?: string;
  PVE_PUBLIC_DOMAIN?: string;
  PVE_VERIFY_TLS?: boolean;
}
