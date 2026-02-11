/**
 * Sandbox Instance
 *
 * Re-exports from @cmux/sandbox-providers for backwards compatibility.
 */

export type {
  ExecResult,
  ExecOptions,
  HttpService,
  SandboxNetworking,
  SandboxInstance,
  StartSandboxResult,
} from "@cmux/sandbox-providers";

export { wrapMorphInstance, wrapPveLxcInstance } from "@cmux/sandbox-providers";

// Re-export SandboxProvider type (also available from sandbox-provider.ts)
export type { SandboxProvider } from "@cmux/sandbox-providers";
