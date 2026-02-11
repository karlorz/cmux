/**
 * Morph Instance Adapter
 *
 * Wraps Morph Cloud instances to conform to the SandboxInstance interface.
 */

import type { Instance } from "morphcloud";
import type { ExecOptions, SandboxInstance } from "../types";

/**
 * Wrap a Morph instance to conform to SandboxInstance interface
 */
export function wrapMorphInstance(instance: Instance): SandboxInstance {
  return {
    id: instance.id,
    status: instance.status,
    metadata: instance.metadata as Record<string, string | undefined>,
    networking: {
      httpServices: instance.networking.httpServices.map((s) => ({
        name: s.name,
        port: s.port,
        url: s.url,
      })),
    },
    exec: async (command: string, options?: ExecOptions) => {
      const timeoutSeconds = options?.timeoutMs
        ? Math.ceil(options.timeoutMs / 1000)
        : undefined;

      const result = await instance.exec(command, timeoutSeconds ? { timeout: timeoutSeconds } : undefined);
      return {
        exit_code: result.exit_code,
        stdout: result.stdout || "",
        stderr: result.stderr || "",
      };
    },
    stop: () => instance.stop(),
    pause: () => instance.pause(),
    resume: () => instance.resume(),
    exposeHttpService: async (name: string, port: number) => {
      await instance.exposeHttpService(name, port);
    },
    hideHttpService: async (name: string) => {
      await instance.hideHttpService(name);
    },
    setWakeOn: (http: boolean, ssh: boolean) => instance.setWakeOn(http, ssh),
  };
}
