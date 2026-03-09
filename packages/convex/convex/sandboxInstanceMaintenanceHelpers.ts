export interface MaintenanceActivityRecord {
  createdAt?: number;
  isCloudWorkspace?: boolean;
  lastResumedAt?: number;
}

export function getContainerNamesNeedingCloudWorkspaceFallback(params: {
  activitiesByInstanceId: Record<string, MaintenanceActivityRecord | undefined>;
  instanceIds: string[];
}): string[] {
  const fallbackNames = new Set<string>();

  for (const instanceId of params.instanceIds) {
    const activity = params.activitiesByInstanceId[instanceId];
    if (activity?.isCloudWorkspace === undefined) {
      fallbackNames.add(instanceId);
    }
  }

  return [...fallbackNames];
}

export function buildCloudWorkspaceProtectionMap(params: {
  activitiesByInstanceId: Record<string, MaintenanceActivityRecord | undefined>;
  instanceIds: string[];
  taskRunCloudWorkspaceFlags: Record<string, boolean>;
}): Record<string, boolean> {
  const protectionByInstance: Record<string, boolean> = {};

  for (const instanceId of params.instanceIds) {
    const activity = params.activitiesByInstanceId[instanceId];
    if (activity?.isCloudWorkspace === true) {
      protectionByInstance[instanceId] = true;
      continue;
    }
    if (activity?.isCloudWorkspace === false) {
      protectionByInstance[instanceId] = false;
      continue;
    }

    protectionByInstance[instanceId] =
      params.taskRunCloudWorkspaceFlags[instanceId] === true;
  }

  return protectionByInstance;
}

export function isPveInstanceStaleForPause(params: {
  activity?: MaintenanceActivityRecord;
  nowMs: number;
  providerCreatedAtSeconds: number;
  thresholdMs: number;
}): boolean {
  const providerCreatedAtMs =
    params.providerCreatedAtSeconds > 0
      ? params.providerCreatedAtSeconds * 1000
      : undefined;

  const lastActiveAt =
    params.activity?.lastResumedAt ??
    params.activity?.createdAt ??
    providerCreatedAtMs;

  if (!lastActiveAt) {
    return true;
  }

  return params.nowMs - lastActiveAt > params.thresholdMs;
}
