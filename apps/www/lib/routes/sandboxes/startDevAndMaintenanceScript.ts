import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_BASENAME = "maintenance";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_BASENAME = "dev";

export type ScriptIdentifiers = {
  maintenance: {
    windowName: string;
    scriptPath: string;
    exitCodePath: string;
    completionMarkerPath: string;
  };
  dev: {
    windowName: string;
    scriptPath: string;
  };
};

export const allocateScriptIdentifiers = (): ScriptIdentifiers => {
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  return {
    maintenance: {
      windowName: `${MAINTENANCE_WINDOW_NAME}-${uniqueSuffix}`,
      scriptPath: `${CMUX_RUNTIME_DIR}/${MAINTENANCE_SCRIPT_BASENAME}-${uniqueSuffix}.sh`,
      exitCodePath: `${CMUX_RUNTIME_DIR}/${MAINTENANCE_SCRIPT_BASENAME}-${uniqueSuffix}.exit-code`,
      completionMarkerPath: `${CMUX_RUNTIME_DIR}/${MAINTENANCE_SCRIPT_BASENAME}-${uniqueSuffix}.completed`,
    },
    dev: {
      windowName: `${DEV_WINDOW_NAME}-${uniqueSuffix}`,
      scriptPath: `${CMUX_RUNTIME_DIR}/${DEV_SCRIPT_BASENAME}-${uniqueSuffix}.sh`,
    },
  };
};

type ScriptResult = {
  maintenanceError: string | null;
  devError: string | null;
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

  const maintenanceSource = maintenanceScript?.trim() ?? "";
  const devSource = devScript?.trim() ?? "";

  if (maintenanceSource.length === 0 && devSource.length === 0) {
    return {
      maintenanceError: "Both maintenance and dev scripts are empty",
      devError: null,
    };
  }

  const waitForTmuxSession = `for i in {1..20}; do
  if tmux has-session -t cmux 2>/dev/null; then
    break
  fi
  sleep 0.5
done
if ! tmux has-session -t cmux 2>/dev/null; then
  echo "Error: cmux session does not exist" >&2
  exit 1
fi`;

  let maintenanceError: string | null = null;
  let devError: string | null = null;
  let maintenanceStarted = false;

  if (maintenanceSource.length > 0) {
    const maintenanceScriptContent = `#!/bin/zsh
set -euo pipefail
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at $(date) ==="

cleanup() {
  EXIT_CODE=$?
  echo "$EXIT_CODE" > ${ids.maintenance.exitCodePath}
  touch ${ids.maintenance.completionMarkerPath}
  if [ "$EXIT_CODE" -ne 0 ]; then
    echo "[MAINTENANCE] Script exited with code $EXIT_CODE" >&2
  else
    echo "[MAINTENANCE] Script completed successfully"
  fi
}
trap cleanup EXIT

${maintenanceSource}

echo "=== Maintenance Script Completed at $(date) ==="
`;

    const maintenanceCommand = `set -euo pipefail
mkdir -p ${CMUX_RUNTIME_DIR}
cat > ${ids.maintenance.scriptPath} <<'SCRIPT_EOF'
${maintenanceScriptContent}
SCRIPT_EOF
chmod +x ${ids.maintenance.scriptPath}
rm -f ${ids.maintenance.exitCodePath} ${ids.maintenance.completionMarkerPath}
${waitForTmuxSession}
tmux new-window -t cmux: -n ${ids.maintenance.windowName} -d
tmux send-keys -t cmux:${ids.maintenance.windowName} "zsh ${ids.maintenance.scriptPath}; exec zsh" C-m
if ! tmux list-windows -t cmux | grep -q "${ids.maintenance.windowName}"; then
  echo "[MAINTENANCE] Failed to start tmux window" >&2
  exit 1
fi
`;

    try {
      const result = await instance.exec(
        `zsh -lc ${singleQuote(maintenanceCommand)}`,
      );

      if (result.exit_code !== 0) {
        const stderr = result.stderr?.trim() || "";
        const stdout = result.stdout?.trim() || "";
        const messageParts = [
          `Failed to launch maintenance script (exit code ${result.exit_code})`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ].filter((part): part is string => part !== null);
        maintenanceError = messageParts.join(" | ");
      } else {
        maintenanceStarted = true;
        console.log(`[MAINTENANCE SCRIPT LAUNCH]\n${result.stdout || ""}`);
      }
    } catch (error) {
      maintenanceError = `Maintenance script launch failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  if (devSource.length > 0) {
    const waitForMaintenanceBlock = maintenanceStarted
      ? `echo "[DEV] Waiting for maintenance to finish..."
while [ ! -f ${ids.maintenance.completionMarkerPath} ]; do
  sleep 1
done
MAINTENANCE_EXIT_CODE=0
if [ -f ${ids.maintenance.exitCodePath} ]; then
  MAINTENANCE_EXIT_CODE=$(cat ${ids.maintenance.exitCodePath} || echo 0)
fi
if [ "$MAINTENANCE_EXIT_CODE" -ne 0 ]; then
  echo "[DEV] Maintenance script exited with code $MAINTENANCE_EXIT_CODE" >&2
fi
echo "[DEV] Maintenance phase complete"
`
      : maintenanceSource.length > 0
        ? `echo "[DEV] Maintenance script failed to launch; skipping wait"`
        : `echo "[DEV] No maintenance script configured; skipping wait"`;

    const devScriptContent = `#!/bin/zsh
set -euo pipefail
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Prepared at $(date) ==="
${waitForMaintenanceBlock}
echo "=== Dev Script Started at $(date) ==="
${devSource}
`;

    const devCommand = `set -euo pipefail
mkdir -p ${CMUX_RUNTIME_DIR}
cat > ${ids.dev.scriptPath} <<'SCRIPT_EOF'
${devScriptContent}
SCRIPT_EOF
chmod +x ${ids.dev.scriptPath}
${waitForTmuxSession}
tmux new-window -t cmux: -n ${ids.dev.windowName} -d
tmux send-keys -t cmux:${ids.dev.windowName} "zsh ${ids.dev.scriptPath}; exec zsh" C-m
if ! tmux list-windows -t cmux | grep -q "${ids.dev.windowName}"; then
  echo "[DEV] ERROR: Window not found" >&2
  exit 1
fi
`;

    try {
      const result = await instance.exec(
        `zsh -lc ${singleQuote(devCommand)}`,
      );

      if (result.exit_code !== 0) {
        const stderr = result.stderr?.trim() || "";
        const stdout = result.stdout?.trim() || "";
        const messageParts = [
          `Failed to launch dev script (exit code ${result.exit_code})`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ].filter((part): part is string => part !== null);
        devError = messageParts.join(" | ");
      } else {
        console.log(`[DEV SCRIPT LAUNCH]\n${result.stdout || ""}`);
      }
    } catch (error) {
      devError = `Dev script launch failed: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  return {
    maintenanceError,
    devError,
  };
}
