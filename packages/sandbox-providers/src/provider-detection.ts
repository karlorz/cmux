import type { SandboxProvider } from "./types";

export type DetectedSandboxProvider = SandboxProvider | "other";

export function isPveLxcInstanceId(instanceId: string): boolean {
  return instanceId.startsWith("pvelxc-") || instanceId.startsWith("cmux-");
}

export function isMorphInstanceId(instanceId: string): boolean {
  return instanceId.startsWith("morphvm_");
}

export function isPveVmInstanceId(instanceId: string): boolean {
  return instanceId.startsWith("pvevm-") || instanceId.startsWith("pve_vm_");
}

export function detectProviderFromInstanceId(instanceId: string): DetectedSandboxProvider {
  if (isMorphInstanceId(instanceId)) {
    return "morph";
  }
  if (isPveLxcInstanceId(instanceId)) {
    return "pve-lxc";
  }
  if (isPveVmInstanceId(instanceId)) {
    return "pve-vm";
  }
  return "other";
}
