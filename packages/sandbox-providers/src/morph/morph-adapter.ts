import type { ExecOptions, SandboxInstance } from "../types";

export interface MorphLikeInstance {
  id: string;
  status: string;
  metadata?: Record<string, string>;
  networking: {
    httpServices: Array<{ name: string; port: number; url: string }>;
  };
  exec(
    command: string,
    options?: { timeout?: number },
  ): Promise<{ exit_code: number; stdout?: string | null; stderr?: string | null }>;
  stop(): Promise<unknown>;
  pause(): Promise<unknown>;
  resume(): Promise<unknown>;
  exposeHttpService(name: string, port: number): Promise<unknown>;
  hideHttpService(name: string): Promise<unknown>;
  setWakeOn(http: boolean, ssh: boolean): Promise<unknown>;
}

export function wrapMorphInstance(instance: MorphLikeInstance): SandboxInstance {
  return {
    id: instance.id,
    status: instance.status,
    metadata: (instance.metadata ?? {}) as Record<string, string | undefined>,
    networking: {
      httpServices: instance.networking.httpServices.map((service) => ({
        name: service.name,
        port: service.port,
        url: service.url,
      })),
    },
    exec: async (command: string, options?: ExecOptions) => {
      const timeoutSeconds = options?.timeoutMs
        ? Math.ceil(options.timeoutMs / 1000)
        : undefined;
      const result = await instance.exec(
        command,
        timeoutSeconds ? { timeout: timeoutSeconds } : undefined,
      );
      return {
        exit_code: result.exit_code,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
    },
    stop: async () => {
      await instance.stop();
    },
    pause: async () => {
      await instance.pause();
    },
    resume: async () => {
      await instance.resume();
    },
    exposeHttpService: async (name: string, port: number) => {
      await instance.exposeHttpService(name, port);
    },
    hideHttpService: async (name: string) => {
      await instance.hideHttpService(name);
    },
    setWakeOn: async (http: boolean, ssh: boolean) => {
      await instance.setWakeOn(http, ssh);
    },
  };
}
