import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_FILENAME = "maintenance.sh";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_FILENAME = "dev.sh";

const WAIT_FOR_TMUX_SESSION_COMMAND = `for i in {1..20}; do
  if tmux has-session -t cmux 2>/dev/null; then
    break
  fi
  sleep 0.5
done
if ! tmux has-session -t cmux 2>/dev/null; then
  echo "Error: cmux session does not exist" >&2
  exit 1
fi`;

const createScriptFileCommand = (path: string, content: string): string =>
  `cat > ${path} <<'SCRIPT_EOF'\n${content}\nSCRIPT_EOF\nchmod +x ${path}`;

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

type ExitCodeCheckResult = {
  exitCode: number | null;
  timedOut: boolean;
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

  const hasMaintenanceScript = Boolean(
    maintenanceScript && maintenanceScript.trim().length > 0,
  );
  const hasDevScript = Boolean(devScript && devScript.trim().length > 0);

  if (!hasMaintenanceScript && !hasDevScript) {
    return {
      maintenanceError: "Both maintenance and dev scripts are empty",
      devError: null,
    };
  }

  const runSuffix = `${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const maintenanceExitCodePath = `${ids.maintenance.scriptPath}.${runSuffix}.exit-code`;
  const maintenanceRunnerPath = `${ids.maintenance.scriptPath}.${runSuffix}.runner`;
  const devRunnerPath = `${ids.dev.scriptPath}.${runSuffix}.runner`;
  const signalName = `cmux-maintenance-${runSuffix}`;

  const maintenanceScriptContent = hasMaintenanceScript
    ? `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \$(date) ==="
${maintenanceScript}
echo "=== Maintenance Script Completed at \$(date) ==="
`
    : null;

  const devScriptContent = hasDevScript
    ? `#!/bin/zsh
set -ux
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Started at \$(date) ==="
${devScript}
`
    : null;

  const orchestratorParts: string[] = [
    "set -eu",
    `mkdir -p ${CMUX_RUNTIME_DIR}`,
    WAIT_FOR_TMUX_SESSION_COMMAND,
  ];

  if (hasMaintenanceScript) {
    orchestratorParts.push(
      createScriptFileCommand(ids.maintenance.scriptPath, maintenanceScriptContent!),
      createScriptFileCommand(
        maintenanceRunnerPath,
        `#!/bin/zsh
set -euo pipefail
cd ${WORKSPACE_ROOT}

trap 'status=$?; print -r -- "$status" > ${maintenanceExitCodePath}; tmux wait-for -S ${signalName}' EXIT
echo "[MAINTENANCE-RUNNER] Starting maintenance script at $(date)"
exec zsh ${ids.maintenance.scriptPath}
`,
      ),
      `rm -f ${maintenanceExitCodePath}`,
      `if tmux list-windows -t cmux -F "#{window_name}" | grep -Fx ${singleQuote(ids.maintenance.windowName)} >/dev/null 2>&1; then
  tmux kill-window -t cmux:${ids.maintenance.windowName}
fi`,
      `tmux new-window -t cmux: -n ${ids.maintenance.windowName} -d ${singleQuote(
        `zsh ${maintenanceRunnerPath}`,
      )}`,
      "sleep 1",
      `if tmux list-windows -t cmux -F "#{window_name}" | grep -Fx ${singleQuote(ids.maintenance.windowName)} >/dev/null 2>&1; then
  echo "[MAINTENANCE] Window is running"
else
  echo "[MAINTENANCE] Window failed to start" >&2
  exit 31
fi`,
    );
  }

  if (hasDevScript) {
    orchestratorParts.push(
      createScriptFileCommand(ids.dev.scriptPath, devScriptContent!),
      createScriptFileCommand(
        devRunnerPath,
        `#!/bin/zsh
set -euo pipefail
cd ${WORKSPACE_ROOT}
${hasMaintenanceScript ? `tmux wait-for ${signalName}
` : ""}echo "[DEV-RUNNER] Launching dev script at $(date)"
exec zsh ${ids.dev.scriptPath}
`,
      ),
      `if tmux list-windows -t cmux -F "#{window_name}" | grep -Fx ${singleQuote(ids.dev.windowName)} >/dev/null 2>&1; then
  tmux kill-window -t cmux:${ids.dev.windowName}
fi`,
      `tmux new-window -t cmux: -n ${ids.dev.windowName} -d ${singleQuote(
        `zsh ${devRunnerPath}`,
      )}`,
      "sleep 1",
      `if tmux list-windows -t cmux -F "#{window_name}" | grep -Fx ${singleQuote(ids.dev.windowName)} >/dev/null 2>&1; then
  echo "[DEV] Window is ready"
else
  echo "[DEV] Window failed to start" >&2
  exit 33
fi`,
    );
  }

  const orchestratorCommand = orchestratorParts.join("\n");

  let maintenanceError: string | null = null;
  let devError: string | null = null;

  try {
    const result = await instance.exec(
      `zsh -lc ${singleQuote(orchestratorCommand)}`,
    );

    if (result.exit_code !== 0) {
      const stderr = result.stderr?.trim() || "";
      const stdout = result.stdout?.trim() || "";
      const messageParts = [
        `Failed to orchestrate scripts (exit ${result.exit_code})`,
        stderr ? `stderr: ${stderr}` : null,
        stdout ? `stdout: ${stdout}` : null,
      ].filter((part): part is string => part !== null);

      if (hasMaintenanceScript) {
        maintenanceError = messageParts.join(" | ");
      }
      if (hasDevScript) {
        devError = messageParts.join(" | ");
      }

      return {
        maintenanceError,
        devError,
      };
    }
  } catch (error) {
    const message = `Failed to orchestrate scripts: ${
      error instanceof Error ? error.message : String(error)
    }`;
    if (hasMaintenanceScript) {
      maintenanceError = message;
    }
    if (hasDevScript) {
      devError = message;
    }

    return {
      maintenanceError,
      devError,
    };
  }

  if (hasMaintenanceScript) {
    try {
      const exitResult = await waitForExitCodeOnInstance({
        instance,
        exitCodePath: maintenanceExitCodePath,
      });

      if (!exitResult.timedOut && exitResult.exitCode !== null) {
        if (exitResult.exitCode !== 0) {
          maintenanceError = `Maintenance script finished with exit code ${exitResult.exitCode}`;
        }
      }
    } catch (error) {
      maintenanceError = `Failed to observe maintenance script completion: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  return {
    maintenanceError,
    devError,
  };
}

async function waitForExitCodeOnInstance({
  instance,
  exitCodePath,
  attempts = 60,
  delaySeconds = 0.5,
}: {
  instance: MorphInstance;
  exitCodePath: string;
  attempts?: number;
  delaySeconds?: number;
}): Promise<ExitCodeCheckResult> {
  const delay = delaySeconds.toString();
  const waitCommand = `set -eu
for i in {1..${attempts}}; do
  if [ -f ${exitCodePath} ]; then
    EXIT_CODE=$(cat ${exitCodePath} || echo 0)
    echo "$EXIT_CODE"
    exit 0
  fi
  sleep ${delay}
 done
echo "timeout waiting for ${exitCodePath}" >&2
exit 2`;

  const result = await instance.exec(
    `zsh -lc ${singleQuote(waitCommand)}`,
  );

  if (result.exit_code === 0) {
    const raw = (result.stdout || "").trim();
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      throw new Error(
        `Unexpected maintenance exit code output '${raw}' from ${exitCodePath}`,
      );
    }
    return { exitCode: parsed, timedOut: false };
  }

  if (result.exit_code === 2) {
    return { exitCode: null, timedOut: true };
  }

  const stderr = result.stderr?.trim() || "";
  const stdout = result.stdout?.trim() || "";
  const messageParts = [
    `Failed to read exit code from ${exitCodePath} (exit ${result.exit_code})`,
    stderr ? `stderr: ${stderr}` : null,
    stdout ? `stdout: ${stdout}` : null,
  ].filter((part): part is string => part !== null);
  throw new Error(messageParts.join(" | "));
}
