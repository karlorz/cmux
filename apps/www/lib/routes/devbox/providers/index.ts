export type DevboxProviderType = "e2b" | "modal" | "morph" | "pve-lxc";

export type DevboxStatus = "running" | "paused" | "stopped" | "unknown";

export interface DevboxInstance {
  id: string;
  provider: DevboxProviderType;
  status: DevboxStatus;
  name?: string;
  templateId?: string;
  gpu?: string;
  metadata?: Record<string, string>;
  createdAt?: number;
  jupyterUrl?: string;
  vscodeUrl?: string;
  workerUrl?: string;
  vncUrl?: string;
}

export interface CreateDevboxOptions {
  templateId?: string;
  name?: string;
  ttlSeconds?: number;
  metadata?: Record<string, string>;
  envs?: Record<string, string>;
  autoPause?: boolean;
  secure?: boolean;
  allowInternetAccess?: boolean;
}

export interface DevboxListOptions {
  metadata?: Record<string, string>;
  limit?: number;
}

export interface DevboxExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface DevboxProvider {
  createInstance(options: CreateDevboxOptions): Promise<DevboxInstance>;
  getInstance(id: string): Promise<DevboxInstance>;
  listInstances(options?: DevboxListOptions): Promise<DevboxInstance[]>;
  stopInstance(id: string): Promise<void>;
  pauseInstance(id: string): Promise<void>;
  resumeInstance(id: string): Promise<void>;
  deleteInstance(id: string): Promise<void>;
  extendTimeout(id: string, timeoutMs: number): Promise<void>;
  exec(
    id: string,
    command: string,
    timeoutMs?: number
  ): Promise<DevboxExecResult>;
  getAuthToken(id: string): Promise<string>;
}
