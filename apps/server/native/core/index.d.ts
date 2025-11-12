export interface PreviewProxyStartOptions {
  start_port?: number;
  max_attempts?: number;
}

export interface PreviewProxyRouteInput {
  morph_id: string;
  scope: string;
  domain_suffix: string;
}

export interface PreviewProxyContextOptions {
  username: string;
  password: string;
  route?: PreviewProxyRouteInput | null;
}

export function getTime(): Promise<string>;
export function gitDiff(opts: unknown): Promise<unknown>;
export function gitListRemoteBranches(opts: unknown): Promise<unknown>;
export function previewProxyEnsureServer(options?: PreviewProxyStartOptions): Promise<number>;
export function previewProxyRegisterContext(options: PreviewProxyContextOptions): void;
export function previewProxyRemoveContext(username: string): void;
export function previewProxySetLogging(enabled: boolean): void;
