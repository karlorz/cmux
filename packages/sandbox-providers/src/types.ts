import type { PveLxcInstance } from "./pve-lxc/pve-lxc-client";

export interface ExecResult {
  exit_code: number;
  stdout: string;
  stderr: string;
}

export interface ExecOptions {
  timeoutMs?: number;
}

export interface HttpService {
  name: string;
  port: number;
  url: string;
}

export interface SandboxNetworking {
  httpServices: HttpService[];
}

export interface SandboxInstance {
  id: string;
  status: string;
  metadata: Record<string, string | undefined>;
  networking: SandboxNetworking;
  exec(command: string, options?: ExecOptions): Promise<ExecResult>;
  stop(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
  exposeHttpService(name: string, port: number): Promise<void>;
  hideHttpService(name: string): Promise<void>;
  setWakeOn(http: boolean, ssh: boolean): Promise<void>;
}

export type SandboxProvider = "morph" | "pve-lxc" | "pve-vm";

export interface StartSandboxResult {
  instance: SandboxInstance;
  provider: SandboxProvider;
  rawPveLxcInstance?: PveLxcInstance;
  vscodeService: HttpService | undefined;
  workerService: HttpService | undefined;
}
