import type { RuntimeProvider, SnapshotProvider } from "@cmux/shared/provider-types";

export type SandboxInstanceActivityMetadata = {
  vmid?: number;
  hostname?: string;
  snapshotId?: string;
  snapshotProvider?: SnapshotProvider;
  templateVmid?: number;
  teamId?: string;
  userId?: string;
  isCloudWorkspace?: boolean;
};

export type SandboxInstanceActivityCreateArgs = {
  instanceId: string;
  provider: RuntimeProvider;
} & SandboxInstanceActivityMetadata;

export function canRecordResumeForOwnership(args: {
  teamId: string;
  activityTeamId?: string;
  hasMatchingTaskRun: boolean;
}): boolean {
  if (args.hasMatchingTaskRun) {
    return true;
  }

  return args.activityTeamId === args.teamId;
}

export function buildSandboxInstanceActivityMetadata(
  args: SandboxInstanceActivityMetadata,
): SandboxInstanceActivityMetadata {
  const metadata: SandboxInstanceActivityMetadata = {};

  if (args.vmid !== undefined) {
    metadata.vmid = args.vmid;
  }
  if (args.hostname !== undefined) {
    metadata.hostname = args.hostname;
  }
  if (args.snapshotId !== undefined) {
    metadata.snapshotId = args.snapshotId;
  }
  if (args.snapshotProvider !== undefined) {
    metadata.snapshotProvider = args.snapshotProvider;
  }
  if (args.templateVmid !== undefined) {
    metadata.templateVmid = args.templateVmid;
  }
  if (args.teamId !== undefined) {
    metadata.teamId = args.teamId;
  }
  if (args.userId !== undefined) {
    metadata.userId = args.userId;
  }
  if (args.isCloudWorkspace !== undefined) {
    metadata.isCloudWorkspace = args.isCloudWorkspace;
  }

  return metadata;
}

export function buildSandboxInstanceActivityInsert(
  args: SandboxInstanceActivityCreateArgs,
  createdAt: number,
): SandboxInstanceActivityCreateArgs & { createdAt: number } {
  return {
    instanceId: args.instanceId,
    provider: args.provider,
    ...buildSandboxInstanceActivityMetadata(args),
    createdAt,
  };
}
