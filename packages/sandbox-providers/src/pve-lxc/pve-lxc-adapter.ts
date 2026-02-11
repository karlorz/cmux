/**
 * PVE LXC Instance Adapter
 *
 * Wraps PVE LXC instances to conform to the SandboxInstance interface.
 */

import type { ExecOptions, SandboxInstance } from "../types";
import type { PveLxcInstance } from "./pve-lxc-client";

/**
 * Wrap a PVE LXC instance to conform to SandboxInstance interface
 */
export function wrapPveLxcInstance(instance: PveLxcInstance): SandboxInstance {
  return {
    id: instance.id,
    status: instance.status,
    metadata: instance.metadata as Record<string, string | undefined>,
    networking: {
      httpServices: instance.networking.httpServices,
    },
    exec: (command: string, options?: ExecOptions) => instance.exec(command, options),
    stop: () => instance.stop(),
    pause: () => instance.pause(),
    resume: () => instance.resume(),
    exposeHttpService: (name: string, port: number) =>
      instance.exposeHttpService(name, port),
    hideHttpService: (name: string) => instance.hideHttpService(name),
    setWakeOn: (_http: boolean, _ssh: boolean) => instance.setWakeOn(_http, _ssh),
  };
}
