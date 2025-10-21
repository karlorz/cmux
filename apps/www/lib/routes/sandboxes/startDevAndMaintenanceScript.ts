import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_FILENAME = "maintenance.sh";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_FILENAME = "dev.sh";
const RUNNER_SCRIPT_PATH = `${WORKSPACE_ROOT}/cmux/scripts/run-maintenance-dev.ts`;
const LOG_FILE_PATH = "/var/log/cmux/dev-maintenance.log";

export type ScriptIdentifiers = {
  maintenance: {
    windowName: string;
    scriptPath: string;
  };
  dev: {
    windowName: string;
    scriptPath: string;
  };
};

export const allocateScriptIdentifiers = (): ScriptIdentifiers => {
  return {
    maintenance: {
      windowName: MAINTENANCE_WINDOW_NAME,
      scriptPath: `${CMUX_RUNTIME_DIR}/${MAINTENANCE_SCRIPT_FILENAME}`,
    },
    dev: {
      windowName: DEV_WINDOW_NAME,
      scriptPath: `${CMUX_RUNTIME_DIR}/${DEV_SCRIPT_FILENAME}`,
    },
  };
};

type ScriptResult = {
  maintenanceError: string | null;
  devError: string | null;
};

type RunnerOutput = {
  maintenance: {
    status: "skipped" | "success" | "failed";
    exitCode: number | null;
    message: string | null;
  };
  dev: {
    status: "skipped" | "started" | "failed";
    message: string | null;
  };
  fatalError: string | null;
};

const appendLogHint = (message: string): string => {
  if (message.includes(LOG_FILE_PATH)) {
    return message;
  }
  return `${message} (see ${LOG_FILE_PATH})`;
};

const preferMessage = (candidate: string | null | undefined, fallback: string): string => {
  if (candidate && candidate.trim().length > 0) {
    return candidate;
  }
  return fallback;
};

const parseRunnerOutput = (stdout: string): RunnerOutput | null => {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const lines = trimmed.split("\n");
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines[index].trim();
    if (candidate.length === 0) {
      continue;
    }

    try {
      const parsed = JSON.parse(candidate) as unknown;
      if (
        parsed &&
        typeof parsed === "object" &&
        "maintenance" in parsed &&
        "dev" in parsed
      ) {
        return parsed as RunnerOutput;
      }
    } catch {
      continue;
    }
  }

  return null;
};

export async function runMaintenanceAndDevScripts({
  instance,
  maintenanceScript,
  devScript,
  identifiers,
}: {
  instance: MorphInstance;
  maintenanceScript?: string;
  devScript?: string;
  identifiers?: ScriptIdentifiers;
}): Promise<ScriptResult> {
  const ids = identifiers ?? allocateScriptIdentifiers();
  const hasMaintenance = Boolean(maintenanceScript && maintenanceScript.trim().length > 0);
  const hasDev = Boolean(devScript && devScript.trim().length > 0);

  if (!hasMaintenance && !hasDev) {
    return {
      maintenanceError: "Both maintenance and dev scripts are empty",
      devError: null,
    };
  }

  const commandParts: string[] = [
    "set -eu",
    `mkdir -p ${CMUX_RUNTIME_DIR}`,
  ];

  if (hasMaintenance && maintenanceScript) {
    const maintenanceScriptContent = `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \$(date) ==="
${maintenanceScript}
echo "=== Maintenance Script Completed at \$(date) ==="
`;

    commandParts.push(
      `cat > ${ids.maintenance.scriptPath} <<'SCRIPT_EOF'
${maintenanceScriptContent}
SCRIPT_EOF`,
      `chmod +x ${ids.maintenance.scriptPath}`,
    );
  }

  if (hasDev && devScript) {
    const devScriptContent = `#!/bin/zsh
set -ux
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Started at \$(date) ==="
${devScript}
`;

    commandParts.push(
      `cat > ${ids.dev.scriptPath} <<'SCRIPT_EOF'
${devScriptContent}
SCRIPT_EOF`,
      `chmod +x ${ids.dev.scriptPath}`,
    );
  }

  const runnerArgs: string[] = [
    "bun",
    singleQuote(RUNNER_SCRIPT_PATH),
    "--session-name",
    singleQuote("cmux"),
    "--runtime-dir",
    singleQuote(CMUX_RUNTIME_DIR),
    "--workspace-root",
    singleQuote(WORKSPACE_ROOT),
    "--log-file",
    singleQuote(LOG_FILE_PATH),
  ];

  if (hasMaintenance) {
    runnerArgs.push("--maintenance-script", singleQuote(ids.maintenance.scriptPath));
    runnerArgs.push("--maintenance-window", singleQuote(ids.maintenance.windowName));
  }

  if (hasDev) {
    runnerArgs.push("--dev-script", singleQuote(ids.dev.scriptPath));
    runnerArgs.push("--dev-window", singleQuote(ids.dev.windowName));
  }

  commandParts.push(runnerArgs.join(" "));

  const command = commandParts.join("\n");

  let maintenanceError: string | null = null;
  let devError: string | null = null;

  try {
    const result = await instance.exec(`zsh -lc ${singleQuote(command)}`);
    const stdout = result.stdout ?? "";
    const stderr = result.stderr ?? "";

    const runnerResult = parseRunnerOutput(stdout);

    if (runnerResult) {
      if (runnerResult.maintenance.status === "failed" && hasMaintenance) {
        const exitCode = runnerResult.maintenance.exitCode;
        const baseMessage = preferMessage(
          runnerResult.maintenance.message,
          exitCode !== null
            ? `Maintenance script exited with code ${exitCode}`
            : "Maintenance script failed",
        );
        maintenanceError = appendLogHint(baseMessage);
      }

      if (runnerResult.dev.status === "failed" && hasDev) {
        const baseMessage = preferMessage(
          runnerResult.dev.message,
          "Dev script failed to start",
        );
        devError = appendLogHint(baseMessage);
      }

      if (runnerResult.fatalError) {
        const fatalMessage = preferMessage(
          runnerResult.fatalError,
          "Maintenance/dev runner encountered a fatal error",
        );
        if (!maintenanceError && hasMaintenance) {
          maintenanceError = appendLogHint(fatalMessage);
        }
        if (!devError && hasDev) {
          devError = appendLogHint(fatalMessage);
        }
      }
    } else {
      const messageParts = [
        "Failed to parse runner output",
        stdout.trim().length > 0 ? `stdout: ${stdout.trim()}` : null,
        stderr.trim().length > 0 ? `stderr: ${stderr.trim()}` : null,
        `exit code: ${result.exit_code}`,
      ].filter((part): part is string => Boolean(part));
      const fallbackMessage = appendLogHint(messageParts.join(" | "));
      if (hasMaintenance) {
        maintenanceError = fallbackMessage;
      }
      if (hasDev) {
        devError = fallbackMessage;
      }
    }
  } catch (error) {
    const failureMessage = appendLogHint(
      `Maintenance/dev runner execution failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    if (hasMaintenance) {
      maintenanceError = failureMessage;
    }
    if (hasDev) {
      devError = failureMessage;
    }
  }

  return {
    maintenanceError,
    devError,
  };
}
