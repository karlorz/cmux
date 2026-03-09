export type SandboxInstanceActivitySummary = {
  createdAt?: number;
  lastPausedAt?: number;
  lastResumedAt?: number;
  stoppedAt?: number;
  isCloudWorkspace?: boolean;
};

export type SandboxInstanceActivityById = Record<
  string,
  SandboxInstanceActivitySummary | undefined
>;

export function getCloudWorkspaceFallbackContainerNames(
  instanceIds: string[],
  activitiesByInstanceId: SandboxInstanceActivityById,
): string[] {
  const containerNames = new Set<string>();

  for (const instanceId of instanceIds) {
    if (activitiesByInstanceId[instanceId]?.isCloudWorkspace === true) {
      continue;
    }
    containerNames.add(instanceId);
  }

  return Array.from(containerNames);
}

export function buildCloudWorkspaceProtectionMap(args: {
  instanceIds: string[];
  activitiesByInstanceId: SandboxInstanceActivityById;
  taskRunCloudWorkspaceByContainerName: Record<string, boolean>;
}): Record<string, boolean> {
  const protection: Record<string, boolean> = {};

  for (const instanceId of args.instanceIds) {
    protection[instanceId] =
      args.activitiesByInstanceId[instanceId]?.isCloudWorkspace === true ||
      args.taskRunCloudWorkspaceByContainerName[instanceId] === true;
  }

  return protection;
}

export async function resolveCloudWorkspaceProtectionMap(args: {
  instanceIds: string[];
  activitiesByInstanceId: SandboxInstanceActivityById;
  fetchTaskRunCloudWorkspaceFlags: (
    containerNames: string[],
  ) => Promise<Record<string, boolean>>;
}): Promise<Record<string, boolean>> {
  const fallbackContainerNames = getCloudWorkspaceFallbackContainerNames(
    args.instanceIds,
    args.activitiesByInstanceId,
  );

  const taskRunCloudWorkspaceByContainerName =
    fallbackContainerNames.length > 0
      ? await args.fetchTaskRunCloudWorkspaceFlags(fallbackContainerNames)
      : {};

  return buildCloudWorkspaceProtectionMap({
    instanceIds: args.instanceIds,
    activitiesByInstanceId: args.activitiesByInstanceId,
    taskRunCloudWorkspaceByContainerName,
  });
}

export function getPauseReferenceTimeMs(args: {
  activity?: SandboxInstanceActivitySummary;
  providerCreatedAtSeconds: number;
}): number | null {
  const providerCreatedAtMs =
    args.providerCreatedAtSeconds > 0
      ? args.providerCreatedAtSeconds * 1000
      : null;

  return (
    args.activity?.lastResumedAt ??
    args.activity?.createdAt ??
    providerCreatedAtMs
  );
}

export function isPastPauseThreshold(args: {
  now: number;
  thresholdMs: number;
  activity?: SandboxInstanceActivitySummary;
  providerCreatedAtSeconds: number;
}): boolean {
  const referenceTimeMs = getPauseReferenceTimeMs({
    activity: args.activity,
    providerCreatedAtSeconds: args.providerCreatedAtSeconds,
  });

  if (referenceTimeMs === null) {
    return true;
  }

  return args.now - referenceTimeMs > args.thresholdMs;
}

export function getLastActivityTimeMs(args: {
  activity?: SandboxInstanceActivitySummary;
  providerCreatedAtSeconds: number;
}): number | null {
  const providerCreatedAtMs =
    args.providerCreatedAtSeconds > 0
      ? args.providerCreatedAtSeconds * 1000
      : null;

  return (
    args.activity?.lastResumedAt ??
    args.activity?.lastPausedAt ??
    args.activity?.createdAt ??
    providerCreatedAtMs
  );
}
