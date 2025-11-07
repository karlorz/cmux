import { api } from "@cmux/convex/api";
import type { Id } from "@cmux/convex/dataModel";
import { spawn } from "node:child_process";
import { createWriteStream, promises as fs } from "node:fs";
import path from "node:path";
import type { ConvexHttpClient } from "./utils/convexClient";
import { serverLogger } from "./utils/fileLogger";

type LocalEnvVar = {
  id: string;
  key: string;
  value: string;
};

type LocalSetupCommand = {
  id: string;
  command: string;
};

const ENV_BLOCK_START = "# >>> cmux local env >>>";
const ENV_BLOCK_END = "# <<< cmux local env <<<";

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const serializeEnvValue = (value: string) => {
  if (/^[A-Za-z0-9_./:-]*$/.test(value)) {
    return value;
  }
  const escaped = value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n");
  return `"${escaped}"`;
};

const runShellCommand = async ({
  command,
  cwd,
  env,
  log,
}: {
  command: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  log: (line: string) => void;
}) => {
  const shell = process.env.SHELL || "/bin/zsh";
  return await new Promise<void>((resolve, reject) => {
    const child = spawn(shell, ["-lc", command], {
      cwd,
      env,
    });

    child.stdout.on("data", (chunk) => {
      log(chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      log(chunk.toString());
    });
    child.on("error", (error) => {
      reject(error);
    });
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Command "${command}" exited with code ${code ?? "unknown"}`
          )
        );
      }
    });
  });
};

async function upsertEnvFile(
  workspacePath: string,
  envVars: LocalEnvVar[],
  log: (line: string) => void
) {
  if (!envVars.length) {
    return;
  }

  const envPath = path.join(workspacePath, ".env.local");
  const block = [
    ENV_BLOCK_START,
    "# Managed by cmux. Edits inside this block will be overwritten.",
    ...envVars.map((entry) => `${entry.key}=${serializeEnvValue(entry.value)}`),
    ENV_BLOCK_END,
    "",
  ].join("\n");

  try {
    const existing = await fs.readFile(envPath, "utf-8");
    const pattern = new RegExp(
      `${escapeRegex(ENV_BLOCK_START)}[\\s\\S]*?${escapeRegex(ENV_BLOCK_END)}\\s*`,
      "m"
    );
    let updated: string;
    if (pattern.test(existing)) {
      updated = existing.replace(pattern, `${block}\n`);
    } else {
      const trimmed = existing.trimEnd();
      updated = trimmed.length > 0 ? `${trimmed}\n\n${block}\n` : `${block}\n`;
    }
    await fs.writeFile(envPath, updated, "utf-8");
    log(
      `Updated .env.local with ${envVars.length} entr${
        envVars.length === 1 ? "y" : "ies"
      }.`
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
    await fs.writeFile(envPath, `${block}\n`, "utf-8");
    log(
      `Created .env.local with ${envVars.length} entr${
        envVars.length === 1 ? "y" : "ies"
      }.`
    );
  }
}

export async function applyLocalWorkspaceBootstrap({
  convex,
  teamSlugOrId,
  workspacePath,
  taskId,
}: {
  convex: ConvexHttpClient;
  teamSlugOrId: string;
  workspacePath: string;
  taskId: Id<"tasks">;
}) {
  try {
    const settings = await convex.query(api.workspaceSettings.get, {
      teamSlugOrId,
    });
    const envVars = (settings?.localEnvVars ?? []) as LocalEnvVar[];
    const setupCommands = (settings?.localSetupCommands ??
      []) as LocalSetupCommand[];

    if (envVars.length === 0 && setupCommands.length === 0) {
      return;
    }

    const cmuxDir = path.join(workspacePath, ".cmux");
    await fs.mkdir(cmuxDir, { recursive: true });
    const logPath = path.join(cmuxDir, "setup.log");
    const logStream = createWriteStream(logPath, { flags: "a" });
    const log = (line: string) => {
      const normalized = line.replace(/[\r\n]+$/g, "");
      const message = `[${new Date().toISOString()}] ${normalized}`;
      logStream.write(`${message}\n`);
      serverLogger.info(message);
    };

    try {
      if (envVars.length > 0) {
        await upsertEnvFile(workspacePath, envVars, log);
      }

      if (setupCommands.length > 0) {
        const envOverlay = envVars.reduce<NodeJS.ProcessEnv>(
          (acc, entry) => {
            acc[entry.key] = entry.value;
            return acc;
          },
          {}
        );
        const comment = `Running ${setupCommands.length} local setup command${
          setupCommands.length === 1 ? "" : "s"
        } in the background. Tail .cmux/setup.log for progress.`;
        try {
          await convex.mutation(api.taskComments.createSystemForTask, {
            teamSlugOrId,
            taskId,
            content: comment,
          });
        } catch (commentError) {
          serverLogger.warn(
            "Failed to create system comment for setup start:",
            commentError
          );
        }

        for (let i = 0; i < setupCommands.length; i++) {
          const entry = setupCommands[i];
          const prefix = `[${i + 1}/${setupCommands.length}]`;
          log(`${prefix} Starting "${entry.command}"`);
          try {
            await runShellCommand({
              command: entry.command,
              cwd: workspacePath,
              env: {
                ...process.env,
                ...envOverlay,
              },
              log: (line) => log(`${prefix} ${line}`),
            });
            log(`${prefix} Completed successfully.`);
          } catch (error) {
            const message = `${prefix} Command "${entry.command}" failed: ${error instanceof Error ? error.message : String(error)}. See .cmux/setup.log.`;
            log(message);
            try {
              await convex.mutation(api.taskComments.createSystemForTask, {
                teamSlugOrId,
                taskId,
                content: message,
              });
            } catch (commentError) {
              serverLogger.warn(
                "Failed to create system comment for setup failure:",
                commentError
              );
            }
            return;
          }
        }

        log("All setup commands completed.");
      }
    } finally {
      await new Promise<void>((resolve) => {
        logStream.end(resolve);
      });
    }
  } catch (error) {
    const message =
      error instanceof Error
        ? `Failed to run local workspace setup: ${error.message}`
        : "Failed to run local workspace setup.";
    serverLogger.error("Failed to apply local workspace bootstrap:", error);
    try {
      await convex.mutation(api.taskComments.createSystemForTask, {
        teamSlugOrId,
        taskId,
        content: `${message} Check server logs for details.`,
      });
    } catch (commentError) {
      serverLogger.warn(
        "Failed to create system comment for bootstrap error:",
        commentError
      );
    }
  }
}
