import { promisify } from "node:util";
import { exec, spawn, type ExecException } from "node:child_process";
import type { WorkerExec, WorkerExecResult } from "@cmux/shared";

const execAsync = promisify(exec);

export async function runWorkerExec(validated: WorkerExec): Promise<WorkerExecResult> {
  const cwd = validated.cwd || process.env.HOME || "/";
  const env = { ...process.env, ...(validated.env || {}) };
  const execOptions = {
    cwd,
    env,
    timeout: validated.timeout,
  } as const;

  try {
    if (validated.detached) {
      return await new Promise<WorkerExecResult>((resolve, reject) => {
        const child = spawn(validated.command, validated.args ?? [], {
          cwd,
          env,
          stdio: "ignore",
          detached: true,
        });

        child.once("error", (error) => {
          reject(error);
        });

        child.once("spawn", () => {
          // Allow the worker process to continue running independently
          child.unref();
          resolve({
            stdout: "",
            stderr: "",
            exitCode: 0,
            pid: child.pid ?? undefined,
          });
        });
      });
    }

    // If the caller asked for a specific shell with -c, execute using that shell
    if (
      (validated.command === "/bin/bash" ||
        validated.command === "bash" ||
        validated.command === "/bin/sh" ||
        validated.command === "sh") &&
      validated.args &&
      validated.args[0] === "-c"
    ) {
      const shellCommand = validated.args.slice(1).join(" ");
      const shellPath = validated.command;
      const { stdout, stderr } = await execAsync(shellCommand, {
        ...execOptions,
        shell: shellPath,
      });
      return { stdout: stdout || "", stderr: stderr || "", exitCode: 0 };
    }

    // Otherwise compose command + args as a single string
    const commandWithArgs = validated.args
      ? `${validated.command} ${validated.args.join(" ")}`
      : validated.command;
    const { stdout, stderr } = await execAsync(commandWithArgs, execOptions);
    return { stdout: stdout || "", stderr: stderr || "", exitCode: 0 };
  } catch (execError: unknown) {
    const isObj = (v: unknown): v is Record<string, unknown> =>
      typeof v === "object" && v !== null;

    const toString = (v: unknown): string => {
      if (typeof v === "string") return v;
      if (isObj(v) && "toString" in v && typeof v.toString === "function") {
        try {
          // Buffer and many objects provide sensible toString()
          return v.toString();
        } catch (_err) {
          return "";
        }
      }
      return "";
    };

    const err = execError as Partial<ExecException> & {
      stdout?: unknown;
      stderr?: unknown;
      code?: number | string;
      signal?: NodeJS.Signals;
    };

    const code = typeof err?.code === "number" ? err.code : 1;
    const stdout = toString(err?.stdout);
    const stderrOutput = toString(err?.stderr);
    const message = typeof err?.message === "string" ? err.message : "";

    return {
      stdout,
      stderr: stderrOutput || message,
      exitCode: code,
      signal: (err?.signal as string | undefined) ?? undefined,
    };
  }
}
