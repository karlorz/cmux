import type { RuntimeProvider } from "@cmux/shared/provider-types";

type TaskRunLifecycleStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";
type VSCodeLifecycleStatus = "starting" | "running" | "stopped";
type StoppableTaskProvider = Extract<RuntimeProvider, "e2b" | "morph" | "pve-lxc">;

type TaskRunStopLike = {
  _id: string;
  status: TaskRunLifecycleStatus;
  vscode?: {
    provider?: RuntimeProvider;
    containerName?: string;
    status?: VSCodeLifecycleStatus;
    stoppedAt?: number;
  };
  networking?: Array<{
    status: VSCodeLifecycleStatus;
    port: number;
    url: string;
  }>;
};

type TaskRunStopStatusLike = Pick<TaskRunStopLike, "status">;
type TaskRunStopMetadataLike = Pick<TaskRunStopLike, "vscode" | "networking">;

export type TaskStopTarget = {
  runId: string;
  instanceId: string;
  provider: StoppableTaskProvider;
};

export function isStoppableTaskProvider(
  provider: string | undefined
): provider is StoppableTaskProvider {
  return provider === "e2b" || provider === "morph" || provider === "pve-lxc";
}

export function collectTaskStopTargets(
  runs: readonly TaskRunStopLike[]
): TaskStopTarget[] {
  return runs.flatMap((run) => {
    const provider = run.vscode?.provider;
    const instanceId = run.vscode?.containerName;
    if (!isStoppableTaskProvider(provider) || !instanceId) {
      return [];
    }
    return [{ runId: run._id, instanceId, provider }];
  });
}

export function shouldMarkTaskRunStopped(run: TaskRunStopStatusLike): boolean {
  return run.status === "pending" || run.status === "running";
}

export function buildStoppedTaskRunMetadataPatch(
  run: TaskRunStopMetadataLike,
  stoppedAt: number
): {
  vscode: {
    provider?: RuntimeProvider;
    status: "stopped";
    stoppedAt: number;
  };
  networking?: Array<{
    status: "stopped";
    port: number;
    url: string;
  }>;
} | null {
  if (!run.vscode) {
    return null;
  }

  return {
    vscode: {
      ...(run.vscode.provider ? { provider: run.vscode.provider } : {}),
      status: "stopped",
      stoppedAt,
    },
    ...(run.networking
      ? {
          networking: run.networking.map((entry) => ({
            ...entry,
            status: "stopped" as const,
          })),
        }
      : {}),
  };
}

export function isIgnorableTaskStopError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  return (
    normalized.includes("404") ||
    normalized.includes("not found") ||
    normalized.includes("already stopped") ||
    normalized.includes("already deleted") ||
    normalized.includes("does not exist")
  );
}
