import type { ServerToWorkerEvents, WorkerToServerEvents } from "@cmux/shared";
import type { Socket } from "@cmux/shared/socket";

export async function workerExec({
  workerSocket,
  command,
  args,
  cwd,
  env,
  timeout = 60000,
  detached = false,
}: {
  workerSocket: Socket<WorkerToServerEvents, ServerToWorkerEvents>;
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
  timeout?: number;
  detached?: boolean;
}): Promise<{
  stdout: string;
  stderr: string;
  exitCode: number;
  error?: string;
  pid?: number;
  signal?: string;
}> {
  return new Promise((resolve, reject) => {
    try {
      workerSocket
        .timeout(timeout)
        .emit(
          "worker:exec",
          { command, args, cwd, env, detached },
          (error, payload) => {
            if (error) {
              // Handle timeout errors gracefully
              if (error instanceof Error && error.message === "operation has timed out") {
                console.error(`[workerExec] Socket timeout for command: ${command}`, error);
                reject(new Error(`Command timed out after ${timeout}ms: ${command}`));
              } else {
                reject(error);
              }
              return;
            }
            if (payload.error) {
              reject(payload.error);
            } else {
              // payload.data conforms to WorkerExecResult
              resolve(payload.data);
            }
          }
        );
    } catch (err) {
      // Catch any synchronous errors
      console.error(`[workerExec] Error emitting command: ${command}`, err);
      reject(err);
    }
  });
}
