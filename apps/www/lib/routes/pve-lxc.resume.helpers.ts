import type { PveLxcInstance } from "@/lib/utils/pve-lxc-client";

const PVE_EXEC_READY_COMMAND = "echo ready";
const PVE_EXEC_READY_TIMEOUT_MS = 10_000;

type PveExecReadyInstance = Pick<PveLxcInstance, "exec" | "id">;

export async function waitForPveExecReady(instance: PveExecReadyInstance): Promise<void> {
  try {
    const result = await instance.exec(PVE_EXEC_READY_COMMAND, {
      timeoutMs: PVE_EXEC_READY_TIMEOUT_MS,
    });

    if (result.exit_code !== 0) {
      throw new Error(
        `readiness probe exited with code ${result.exit_code}${result.stderr ? `: ${result.stderr}` : ""}`,
      );
    }

    if (!result.stdout.includes("ready")) {
      throw new Error(`readiness probe did not report ready: ${JSON.stringify(result.stdout)}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`PVE exec endpoint not ready for ${instance.id}: ${message}`);
  }
}
