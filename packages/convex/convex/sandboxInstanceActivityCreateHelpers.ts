import type { SnapshotProvider } from "@cmux/shared/provider-types";

export interface SandboxInstanceCreateActivityMetadata {
  hostname?: string;
  isCloudWorkspace?: boolean;
  snapshotId?: string;
  snapshotProvider?: SnapshotProvider;
  teamId?: string;
  templateVmid?: number;
  userId?: string;
  vmid?: number;
}

function buildCreateActivityMetadata(
  input: SandboxInstanceCreateActivityMetadata,
): SandboxInstanceCreateActivityMetadata {
  return {
    teamId: input.teamId,
    userId: input.userId,
    vmid: input.vmid,
    hostname: input.hostname,
    snapshotId: input.snapshotId,
    snapshotProvider: input.snapshotProvider,
    templateVmid: input.templateVmid,
    isCloudWorkspace: input.isCloudWorkspace,
  };
}

export function buildRecordCreateInternalActivityMetadata(
  input: SandboxInstanceCreateActivityMetadata,
): SandboxInstanceCreateActivityMetadata {
  return buildCreateActivityMetadata(input);
}

export function buildRecordCreateActivityMetadata(
  input: SandboxInstanceCreateActivityMetadata,
): SandboxInstanceCreateActivityMetadata {
  return buildCreateActivityMetadata(input);
}
