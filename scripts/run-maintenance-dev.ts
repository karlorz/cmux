#!/usr/bin/env bun

import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type MaintenanceStatus = "skipped" | "success" | "failed";
type DevStatus = "skipped" | "started" | "failed";

type RunnerResult = {
  maintenance: {
    status: MaintenanceStatus;
    exitCode: number | null;
    message: string | null;
  };
  dev: {
    status: DevStatus;
    message: string | null;
  };
  fatalError: string | null;
};

type Config = {
  sessionName: string;
  runtimeDir: string;
  workspaceRoot: string;
  logFile: string;
  maintenanceScript?: string;
  maintenanceWindow: string;
  devScript?: string;
  devWindow: string;
  tmuxProbeAttempts: number;
  tmuxProbeDelayMs: number;
};

const DEFAULT_TMUX_ATTEMPTS = 40;
const DEFAULT_TMUX_DELAY_MS = 500;

async function runCommand(command: string, args: string[]): Promise<CommandResult> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code, signal) => {
      const exitCode = code ?? (signal ? 128 : 1);
      resolve({ code: exitCode, stdout, stderr });
    });
  });
}

async function waitForTmuxSession(config: Config): Promise<boolean> {
  for (let attempt = 0; attempt < config.tmuxProbeAttempts; attempt += 1) {
    try {
      const result = await runCommand("tmux", ["has-session", "-t", config.sessionName]);
      if (result.code === 0) {
        return true;
      }
    } catch (error) {
      await appendLog(config.logFile, `tmux has-session error: ${formatError(error)}`);
      return false;
    }
    await delay(config.tmuxProbeDelayMs);
  }
  return false;
}

async function appendLog(logFile: string, message: string): Promise<void> {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  try {
    await fs.mkdir(path.dirname(logFile), { recursive: true });
    await fs.appendFile(logFile, line, "utf8");
  } catch (error) {
    console.error(`log append failed: ${formatError(error)}`);
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function waitForExitCode(exitCodePath: string): Promise<number> {
  while (true) {
    if (await fileExists(exitCodePath)) {
      const raw = await fs.readFile(exitCodePath, "utf8");
      const trimmed = raw.trim();
      const value = Number.parseInt(trimmed, 10);
      if (Number.isNaN(value)) {
        throw new Error(`Invalid exit code content: "${trimmed}"`);
      }
      return value;
    }
    await delay(1000);
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function parseArgs(argv: string[]): Config {
  const config: Partial<Config> = {
    maintenanceWindow: "maintenance",
    devWindow: "dev",
    sessionName: "cmux",
    tmuxProbeAttempts: DEFAULT_TMUX_ATTEMPTS,
    tmuxProbeDelayMs: DEFAULT_TMUX_DELAY_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) {
      throw new Error(`Unexpected argument "${current}"`);
    }

    const key = current.slice(2);
    const value = argv[i + 1];
    if (value === undefined) {
      throw new Error(`Missing value for --${key}`);
    }
    i += 1;

    switch (key) {
      case "session-name":
        config.sessionName = value;
        break;
      case "runtime-dir":
        config.runtimeDir = value;
        break;
      case "workspace-root":
        config.workspaceRoot = value;
        break;
      case "log-file":
        config.logFile = value;
        break;
      case "maintenance-script":
        config.maintenanceScript = value;
        break;
      case "maintenance-window":
        config.maintenanceWindow = value;
        break;
      case "dev-script":
        config.devScript = value;
        break;
      case "dev-window":
        config.devWindow = value;
        break;
      case "tmux-wait-attempts":
        config.tmuxProbeAttempts = Number.parseInt(value, 10);
        break;
      case "tmux-wait-delay-ms":
        config.tmuxProbeDelayMs = Number.parseInt(value, 10);
        break;
      default:
        throw new Error(`Unknown argument --${key}`);
    }
  }

  if (!config.runtimeDir) {
    throw new Error("Missing required argument --runtime-dir");
  }
  if (!config.workspaceRoot) {
    throw new Error("Missing required argument --workspace-root");
  }
  if (!config.logFile) {
    throw new Error("Missing required argument --log-file");
  }

  if (!config.maintenanceScript && !config.devScript) {
    throw new Error("At least one of --maintenance-script or --dev-script must be provided");
  }

  if (!config.tmuxProbeAttempts || config.tmuxProbeAttempts < 1) {
    config.tmuxProbeAttempts = DEFAULT_TMUX_ATTEMPTS;
  }
  if (!config.tmuxProbeDelayMs || config.tmuxProbeDelayMs < 0) {
    config.tmuxProbeDelayMs = DEFAULT_TMUX_DELAY_MS;
  }

  return config as Config;
}

async function runMaintenance(config: Config, result: RunnerResult): Promise<void> {
  if (!config.maintenanceScript) {
    return;
  }

  const runnerId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const runnerPath = path.join(config.runtimeDir, `maintenance-runner-${runnerId}.sh`);
  const exitCodePath = `${runnerPath}.exit-code`;

  await fs.mkdir(config.runtimeDir, { recursive: true });
  await fs.rm(exitCodePath, { force: true });

  const runnerScript = `#!/bin/zsh
set -u
cd ${config.workspaceRoot}
zsh ${config.maintenanceScript}
EXIT_CODE=$?
echo "$EXIT_CODE" > ${exitCodePath}
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[MAINTENANCE] Script exited with code $EXIT_CODE" >&2
else
  echo "[MAINTENANCE] Script completed successfully"
fi
exec zsh
`;

  await fs.writeFile(runnerPath, runnerScript, { encoding: "utf8" });
  await fs.chmod(runnerPath, 0o755);

  await runCommand("tmux", ["kill-window", "-t", `${config.sessionName}:${config.maintenanceWindow}`]).catch(() => undefined);

  const spawnResult = await runCommand("tmux", [
    "new-window",
    "-t",
    `${config.sessionName}:`,
    "-n",
    config.maintenanceWindow,
    "-d",
    `zsh ${runnerPath}`,
  ]);

  if (spawnResult.code !== 0) {
    const message = `Failed to start maintenance window: ${spawnResult.stderr.trim() || spawnResult.stdout.trim() || `exit code ${spawnResult.code}`}`;
    result.maintenance.status = "failed";
    result.maintenance.message = message;
    await appendLog(config.logFile, message);
    await fs.rm(runnerPath, { force: true });
    return;
  }

  try {
    const exitCode = await waitForExitCode(exitCodePath);
    result.maintenance.exitCode = exitCode;
    if (exitCode === 0) {
      result.maintenance.status = "success";
      result.maintenance.message = null;
    } else {
      const message = `Maintenance script exited with code ${exitCode}`;
      result.maintenance.status = "failed";
      result.maintenance.message = message;
      await appendLog(config.logFile, message);
    }
  } catch (error) {
    const message = `Maintenance exit code wait failed: ${formatError(error)}`;
    result.maintenance.status = "failed";
    result.maintenance.message = message;
    await appendLog(config.logFile, message);
  } finally {
    await Promise.allSettled([
      fs.rm(exitCodePath, { force: true }),
      fs.rm(runnerPath, { force: true }),
    ]);
  }
}

async function runDev(config: Config, result: RunnerResult): Promise<void> {
  if (!config.devScript) {
    return;
  }

  await runCommand("tmux", ["kill-window", "-t", `${config.sessionName}:${config.devWindow}`]).catch(() => undefined);

  const createWindow = await runCommand("tmux", [
    "new-window",
    "-t",
    `${config.sessionName}:`,
    "-n",
    config.devWindow,
    "-d",
  ]);

  if (createWindow.code !== 0) {
    const message = `Failed to create dev window: ${createWindow.stderr.trim() || createWindow.stdout.trim() || `exit code ${createWindow.code}`}`;
    result.dev.status = "failed";
    result.dev.message = message;
    await appendLog(config.logFile, message);
    return;
  }

  const sendKeys = await runCommand("tmux", [
    "send-keys",
    "-t",
    `${config.sessionName}:${config.devWindow}`,
    `zsh ${config.devScript}`,
    "C-m",
  ]);

  if (sendKeys.code !== 0) {
    const message = `Failed to send dev script command: ${sendKeys.stderr.trim() || sendKeys.stdout.trim() || `exit code ${sendKeys.code}`}`;
    result.dev.status = "failed";
    result.dev.message = message;
    await appendLog(config.logFile, message);
    return;
  }

  await delay(2000);

  const listWindows = await runCommand("tmux", ["list-windows", "-t", config.sessionName]);
  if (listWindows.code !== 0) {
    const message = `tmux list-windows failed: ${listWindows.stderr.trim() || `exit code ${listWindows.code}`}`;
    result.dev.status = "failed";
    result.dev.message = message;
    await appendLog(config.logFile, message);
    return;
  }

  const windowExists = listWindows.stdout
    .split("\n")
    .some((line) => line.includes(`:${config.devWindow}`));

  if (!windowExists) {
    const message = `Dev window ${config.devWindow} not found after launch`;
    result.dev.status = "failed";
    result.dev.message = message;
    await appendLog(config.logFile, message);
    return;
  }

  result.dev.status = "started";
  result.dev.message = null;
}

async function main(): Promise<void> {
  const result: RunnerResult = {
    maintenance: {
      status: "skipped",
      exitCode: null,
      message: null,
    },
    dev: {
      status: "skipped",
      message: null,
    },
    fatalError: null,
  };

  try {
    const argv = process.argv.slice(2);
    const config = parseArgs(argv);

    await fs.mkdir(config.runtimeDir, { recursive: true });

    const sessionReady = await waitForTmuxSession(config);
    if (!sessionReady) {
      const message = `tmux session ${config.sessionName} is not available`;
      result.fatalError = message;
      if (config.maintenanceScript) {
        result.maintenance.status = "failed";
        result.maintenance.message = message;
      }
      if (config.devScript) {
        result.dev.status = "failed";
        result.dev.message = message;
      }
      await appendLog(config.logFile, message);
      console.log(JSON.stringify(result));
      process.exitCode = 1;
      return;
    }

    await runMaintenance(config, result);
    await runDev(config, result);

    if (
      result.maintenance.status === "failed" ||
      result.dev.status === "failed"
    ) {
      process.exitCode = 1;
    }

    console.log(JSON.stringify(result));
  } catch (error) {
    const message = `Runner failure: ${formatError(error)}`;
    await appendLog("/var/log/cmux/dev-maintenance.log", message);
    const result: RunnerResult = {
      maintenance: {
        status: "failed",
        exitCode: null,
        message,
      },
      dev: {
        status: "failed",
        message,
      },
      fatalError: message,
    };
    console.log(JSON.stringify(result));
    process.exitCode = 1;
  }
}

void main();
