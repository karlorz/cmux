import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_FILENAME = "maintenance.sh";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_FILENAME = "dev.sh";
const MAINTENANCE_STATUS_TIMEOUT_SECONDS = 20;
const DEV_WAIT_FOR_MAINTENANCE_TIMEOUT_SECONDS = 60 * 30;
const DEV_WAIT_LOG_INTERVAL_SECONDS = 30;

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

  const maintenanceScriptBody =
    maintenanceScript && maintenanceScript.trim().length > 0
      ? maintenanceScript.trim()
      : undefined;
  const devScriptBody =
    devScript && devScript.trim().length > 0 ? devScript.trim() : undefined;

  if (!maintenanceScriptBody && !devScriptBody) {
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
  let maintenanceStatusPromise: Promise<void> | null = null;

  const maintenanceRunId =
    maintenanceScriptBody !== undefined
      ? `maintenance_${Date.now().toString(36)}_${Math.random()
          .toString(36)
          .slice(2, 10)}`
      : null;

  const maintenanceExitCodePath =
    maintenanceRunId !== null
      ? `${ids.maintenance.scriptPath}.${maintenanceRunId}.exit-code`
      : null;

  if (maintenanceScriptBody) {
    const exitCodePath = maintenanceExitCodePath!;

    const maintenanceScriptContent = `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \$(date) ==="
${maintenanceScriptBody}
echo "=== Maintenance Script Completed at \$(date) ==="
`;

    const maintenanceWindowCommand = `zsh "${ids.maintenance.scriptPath}"
EXIT_CODE=$?
echo "$EXIT_CODE" > "${exitCodePath}"
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[MAINTENANCE] Script exited with code $EXIT_CODE" >&2
else
  echo "[MAINTENANCE] Script completed successfully"
fi
exec zsh`;

    const maintenanceCommand = `set -eu
mkdir -p ${CMUX_RUNTIME_DIR}
cat > ${ids.maintenance.scriptPath} <<'SCRIPT_EOF'
${maintenanceScriptContent}
SCRIPT_EOF
chmod +x ${ids.maintenance.scriptPath}
rm -f ${exitCodePath}
${waitForTmuxSession}
tmux new-window -t cmux: -n ${ids.maintenance.windowName} -d ${singleQuote(maintenanceWindowCommand)}
sleep 2
if tmux list-windows -t cmux | grep -q "${ids.maintenance.windowName}"; then
  echo "[MAINTENANCE] Window is running"
else
  echo "[MAINTENANCE] Window failed to stay running" >&2
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
        console.log(`[MAINTENANCE SCRIPT VERIFICATION]\n${result.stdout || ""}`);
      }
    } catch (error) {
      maintenanceError = `Maintenance script execution failed: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (!maintenanceError) {
      const maintenanceStatusCommand = `set -eu
END=$(( $(date +%s) + ${MAINTENANCE_STATUS_TIMEOUT_SECONDS} ))
while [ ! -f ${exitCodePath} ] && [ $(date +%s) -lt $END ]; do
  sleep 1
done
if [ -f ${exitCodePath} ]; then
  EXIT_CODE=$(cat ${exitCodePath} 2>/dev/null || echo 0)
  echo "$EXIT_CODE"
  exit $EXIT_CODE
fi
echo "PENDING"
`;

      maintenanceStatusPromise = (async () => {
        try {
          const statusResult = await instance.exec(
            `zsh -lc ${singleQuote(maintenanceStatusCommand)}`,
          );

          const stdout = statusResult.stdout?.trim() ?? "";
          const stderr = statusResult.stderr?.trim() ?? "";

          if (statusResult.exit_code !== 0) {
            const messageParts = [
              `Maintenance script exited with code ${statusResult.exit_code}`,
              stdout ? `stdout: ${stdout}` : null,
              stderr ? `stderr: ${stderr}` : null,
            ].filter((part): part is string => part !== null);
            maintenanceError = messageParts.join(" | ");
            return;
          }

          if (stdout === "PENDING" || stdout.length === 0) {
            console.log(
              `[MAINTENANCE] Exit code pending after ${MAINTENANCE_STATUS_TIMEOUT_SECONDS}s; continuing in background`,
            );
            return;
          }

          const parsedExit = Number.parseInt(stdout.split(/\s+/)[0] ?? "", 10);
          if (!Number.isNaN(parsedExit) && parsedExit !== 0) {
            maintenanceError = `Maintenance script exited with code ${parsedExit}`;
          }
        } catch (statusError) {
          console.error(
            "[MAINTENANCE] Failed to poll maintenance exit code",
            statusError,
          );
        }
      })();
    }
  }

  if (devScriptBody) {
    const maintenanceWaitSnippet =
      maintenanceScriptBody && maintenanceExitCodePath
        ? `MAINTENANCE_READY_FILE="${maintenanceExitCodePath}"
WAIT_LIMIT=${DEV_WAIT_FOR_MAINTENANCE_TIMEOUT_SECONDS}
WAITED=0
echo "[DEV] Waiting for maintenance to complete..."
while [ ! -f "$MAINTENANCE_READY_FILE" ] && [ $WAITED -lt $WAIT_LIMIT ]; do
  sleep 1
  WAITED=$((WAITED + 1))
  if [ $((WAITED % ${DEV_WAIT_LOG_INTERVAL_SECONDS})) -eq 0 ]; then
    echo "[DEV] Still waiting for maintenance ($WAITED s)"
  fi
done
if [ ! -f "$MAINTENANCE_READY_FILE" ]; then
  echo "[DEV] Maintenance completion file not found after $WAIT_LIMIT seconds; continuing anyway" >&2
else
  MAINTENANCE_EXIT_CODE=$(cat "$MAINTENANCE_READY_FILE" 2>/dev/null || echo 0)
  echo "[DEV] Maintenance exit code: $MAINTENANCE_EXIT_CODE"
fi

`
        : "";

    const devScriptContent = `#!/bin/zsh
set -ux
cd ${WORKSPACE_ROOT}

${maintenanceWaitSnippet}echo "=== Dev Script Started at \\$(date) ==="
${devScriptBody}
`;

    const devCommand = `set -eu
mkdir -p ${CMUX_RUNTIME_DIR}
cat > ${ids.dev.scriptPath} <<'SCRIPT_EOF'
${devScriptContent}
SCRIPT_EOF
chmod +x ${ids.dev.scriptPath}
${waitForTmuxSession}
tmux new-window -t cmux: -n ${ids.dev.windowName} -d
tmux send-keys -t cmux:${ids.dev.windowName} "zsh ${ids.dev.scriptPath}" C-m
sleep 2
if tmux list-windows -t cmux | grep -q "${ids.dev.windowName}"; then
  echo "[DEV] Window is running"
else
  echo "[DEV] ERROR: Window not found" >&2
  exit 1
fi
`;

    try {
      const result = await instance.exec(`zsh -lc ${singleQuote(devCommand)}`);

      if (result.exit_code !== 0) {
        const stderr = result.stderr?.trim() || "";
        const stdout = result.stdout?.trim() || "";
        const messageParts = [
          `Failed to start dev script with exit code ${result.exit_code}`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ].filter((part): part is string => part !== null);
        devError = messageParts.join(" | ");
      } else {
        console.log(`[DEV SCRIPT VERIFICATION]\n${result.stdout || ""}`);
      }
    } catch (error) {
      devError = `Dev script execution failed: ${error instanceof Error ? error.message : String(error)}`;
    }
  }


  if (maintenanceStatusPromise) {
    await maintenanceStatusPromise;
  }

  return {
    maintenanceError,
    devError,
  };
}
