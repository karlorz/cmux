import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import type { FunctionReturnType } from "convex/server";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { getConvex } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";
import { getAuthHeaderJson, getAuthToken } from "./utils/requestContext";
import { getWwwBaseUrl } from "./utils/server-env";

const execAsync = promisify(exec);

export type VSCodeProvider = "docker" | "morph" | "daytona" | "other";

export interface StopResult {
  success: boolean;
  containerName: string;
  provider: VSCodeProvider;
  error?: unknown;
}

type ContainerTarget = {
  provider: VSCodeProvider;
  containerName: string;
  runId: string;
};

async function stopDockerContainer(containerName: string): Promise<void> {
  try {
    await execAsync(`docker stop ${containerName}`, { timeout: 15_000 });
    return;
  } catch (err) {
    // If docker stop failed, check if it's already exited/stopped
    try {
      const { stdout } = await execAsync(
        `docker ps -a --filter "name=^${containerName}$" --format "{{.Status}}"`
      );
      if (stdout.toLowerCase().includes("exited")) {
        // Consider success if the container is already stopped
        return;
      }
    } catch {
      // ignore check errors and rethrow original
    }
    throw err;
  }
}

async function stopCmuxSandbox(instanceId: string): Promise<void> {
  const baseUrl = getWwwBaseUrl();
  const url = `${baseUrl}/api/sandboxes/${encodeURIComponent(instanceId)}/stop`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers["x-stack-auth"] =
      getAuthHeaderJson() || JSON.stringify({ accessToken: token });
  }
  const res = await fetch(url, { method: "POST", headers });
  if (!res.ok && res.status !== 204) {
    throw new Error(
      `Failed stopping sandbox ${instanceId}: HTTP ${res.status}`
    );
  }
}

export async function stopContainersForRuns(
  taskId: Id<"tasks">,
  teamSlugOrId: string,
  query: (
    ref: typeof api.taskRuns.getByTask,
    args: { teamSlugOrId: string; taskId: Id<"tasks"> }
  ) => Promise<FunctionReturnType<typeof api.taskRuns.getByTask>> = (
    ref,
    args
  ) => getConvex().query(ref, args)
): Promise<StopResult[]> {
  const tree = await query(api.taskRuns.getByTask, {
    teamSlugOrId,
    taskId,
  });
  return stopContainersForRunsFromTree(tree, String(taskId));
}

export function stopContainersForRunsFromTree(
  tree: FunctionReturnType<typeof api.taskRuns.getByTask>,
  taskIdLabel?: string
): Promise<StopResult[]> {
  // Flatten tree without casts
  const flat: unknown[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
      flat.push(n);
      if (typeof n === "object" && n !== null) {
        const children = Reflect.get(Object(n), "children");
        walk(children);
      }
    }
  };
  walk(tree);

  if (typeof taskIdLabel === "string") {
    serverLogger.info(`Archiving task ${taskIdLabel} with ${flat.length} runs`);
  }

  // Collect valid docker/morph targets
  const targets: ContainerTarget[] = [];
  for (const r of flat) {
    const target = extractContainerTargetFromRunLike(r);
    if (target) {
      targets.push(target);
    }
  }

  return Promise.all(
    targets.map((target) => stopContainerTarget(target))
  );
}

export function extractContainerTargetFromRunLike(
  run: unknown
): ContainerTarget | null {
  if (typeof run !== "object" || run === null) return null;
  const runObj = Object(run);
  const runId = Reflect.get(runObj, "_id");
  if (typeof runId !== "string") return null;
  const vscode = Reflect.get(runObj, "vscode");
  if (typeof vscode !== "object" || vscode === null) return null;
  const provider = Reflect.get(Object(vscode), "provider");
  const containerName = Reflect.get(Object(vscode), "containerName");
  if (
    (provider === "docker" || provider === "morph") &&
    typeof containerName === "string"
  ) {
    return {
      provider,
      containerName,
      runId,
    };
  }

  return null;
}

export async function stopContainerForRun(
  run: {
    _id: string;
    vscode?: {
      provider?: VSCodeProvider;
      containerName?: string;
    } | null;
  } | null
): Promise<StopResult | null> {
  if (!run) return null;
  const target = extractContainerTargetFromRunLike(run);
  if (!target) return null;
  return await stopContainerTarget(target);
}

async function stopContainerTarget(target: ContainerTarget): Promise<StopResult> {
  try {
    serverLogger.info(
      `Stopping ${target.provider} container for run ${target.runId}: ${target.containerName}`
    );
    if (target.provider === "docker") {
      const actualContainerName = target.containerName.startsWith("docker-")
        ? target.containerName.substring(7)
        : target.containerName;
      await stopDockerContainer(actualContainerName);
      serverLogger.info(
        `Successfully stopped Docker container: ${target.containerName} (actual: ${actualContainerName})`
      );
      return {
        success: true,
        containerName: target.containerName,
        provider: target.provider,
      };
    }
    if (target.provider === "morph") {
      await stopCmuxSandbox(target.containerName);
      serverLogger.info(
        `Successfully paused Morph instance: ${target.containerName}`
      );
      return {
        success: true,
        containerName: target.containerName,
        provider: target.provider,
      };
    }
    serverLogger.warn(
      `Unsupported provider '${target.provider}' for container ${target.containerName}`
    );
    return {
      success: false,
      containerName: target.containerName,
      provider: target.provider,
      error: new Error("Unsupported provider"),
    };
  } catch (error) {
    serverLogger.error(
      `Failed to stop ${target.provider} container ${target.containerName}:`,
      error
    );
    return {
      success: false,
      containerName: target.containerName,
      provider: target.provider,
      error,
    };
  }
}
