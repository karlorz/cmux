import type { MorphInstance } from "./git";
import { singleQuote } from "./shell";

const WORKSPACE_ROOT = "/root/workspace";
const CMUX_RUNTIME_DIR = "/var/tmp/cmux-scripts";
const MAINTENANCE_WINDOW_NAME = "maintenance";
const MAINTENANCE_SCRIPT_FILENAME = "maintenance.sh";
const DEV_WINDOW_NAME = "dev";
const DEV_SCRIPT_FILENAME = "dev.sh";

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

  if (
    (!maintenanceScript || maintenanceScript.trim().length === 0) &&
    (!devScript || devScript.trim().length === 0)
  ) {
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

  // Generate unique run IDs for this execution
  const runId = `${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
  const orchestratorScriptPath = `${CMUX_RUNTIME_DIR}/orchestrator_${runId}.ts`;
  const maintenanceExitCodePath = `${CMUX_RUNTIME_DIR}/maintenance_${runId}.exit-code`;

  // Create maintenance script if provided
  const maintenanceScriptContent = maintenanceScript && maintenanceScript.trim().length > 0
    ? `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \$(date) ==="
${maintenanceScript}
echo "=== Maintenance Script Completed at \$(date) ==="
`
    : null;

  // Create dev script if provided
  const devScriptContent = devScript && devScript.trim().length > 0
    ? `#!/bin/zsh
set -ux
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Started at \$(date) ==="
${devScript}
`
    : null;

  // Create Bun orchestrator script that runs both sequentially in a single process
  const orchestratorScript = `#!/usr/bin/env bun
import { $ } from "bun";

const WORKSPACE_ROOT = "${WORKSPACE_ROOT}";
const CMUX_RUNTIME_DIR = "${CMUX_RUNTIME_DIR}";
const maintenanceScriptPath = "${ids.maintenance.scriptPath}";
const devScriptPath = "${ids.dev.scriptPath}";
const maintenanceWindowName = "${ids.maintenance.windowName}";
const devWindowName = "${ids.dev.windowName}";
const maintenanceExitCodePath = "${maintenanceExitCodePath}";
const hasMaintenanceScript = ${maintenanceScriptContent !== null};
const hasDevScript = ${devScriptContent !== null};

// Wait for tmux session to be ready
async function waitForTmuxSession(): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      const result = await $\`tmux has-session -t cmux 2>/dev/null\`.quiet();
      if (result.exitCode === 0) {
        return;
      }
    } catch (error) {
      // Session not ready yet
    }
    await Bun.sleep(500);
  }

  // Final check
  const result = await $\`tmux has-session -t cmux 2>/dev/null\`.quiet();
  if (result.exitCode !== 0) {
    throw new Error("Error: cmux session does not exist");
  }
}

// Run maintenance script and wait for completion
async function runMaintenanceScript(): Promise<{ exitCode: number; error: string | null }> {
  if (!hasMaintenanceScript) {
    console.log("[MAINTENANCE] No maintenance script to run");
    return { exitCode: 0, error: null };
  }

  try {
    console.log("[MAINTENANCE] Starting maintenance script...");

    const maintenanceWindowCommand = \`zsh "\${maintenanceScriptPath}"
EXIT_CODE=$?
echo "$EXIT_CODE" > "\${maintenanceExitCodePath}"
if [ "$EXIT_CODE" -ne 0 ]; then
  echo "[MAINTENANCE] Script exited with code $EXIT_CODE" >&2
else
  echo "[MAINTENANCE] Script completed successfully"
fi
exec zsh\`;

    await waitForTmuxSession();

    // Start maintenance window
    await $\`tmux new-window -t cmux: -n \${maintenanceWindowName} -d \${maintenanceWindowCommand}\`;

    await Bun.sleep(2000);

    // Check if window is running
    const windowCheck = await $\`tmux list-windows -t cmux\`.text();
    if (windowCheck.includes(maintenanceWindowName)) {
      console.log("[MAINTENANCE] Window is running");
    } else {
      console.log("[MAINTENANCE] Window may have exited (normal if script completed)");
    }

    // Wait for exit code file
    while (true) {
      const file = Bun.file(maintenanceExitCodePath);
      if (await file.exists()) {
        break;
      }
      await Bun.sleep(1000);
    }

    // Read exit code
    const exitCodeFile = Bun.file(maintenanceExitCodePath);
    const exitCodeText = await exitCodeFile.text();
    const exitCode = parseInt(exitCodeText.trim()) || 0;

    // Clean up exit code file
    await $\`rm -f \${maintenanceExitCodePath}\`;

    console.log(\`[MAINTENANCE] Wait complete with exit code \${exitCode}\`);

    if (exitCode !== 0) {
      return {
        exitCode,
        error: \`Maintenance script finished with exit code \${exitCode}\`
      };
    }

    return { exitCode: 0, error: null };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(\`[MAINTENANCE] Error: \${errorMessage}\`);
    return {
      exitCode: 1,
      error: \`Maintenance script execution failed: \${errorMessage}\`
    };
  }
}

// Start dev script in background (does not wait for completion)
async function startDevScript(): Promise<{ error: string | null }> {
  if (!hasDevScript) {
    console.log("[DEV] No dev script to run");
    return { error: null };
  }

  try {
    console.log("[DEV] Starting dev script...");

    await waitForTmuxSession();

    // Create new window and send keys to start script
    await $\`tmux new-window -t cmux: -n \${devWindowName} -d\`;
    await $\`tmux send-keys -t cmux:\${devWindowName} "zsh \${devScriptPath}" C-m\`;

    await Bun.sleep(2000);

    // Verify window is running
    const windowCheck = await $\`tmux list-windows -t cmux\`.text();
    if (windowCheck.includes(devWindowName)) {
      console.log("[DEV] Window is running");
      return { error: null };
    } else {
      const error = "Dev window not found after creation";
      console.error(\`[DEV] ERROR: \${error}\`);
      return { error };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(\`[DEV] Error: \${errorMessage}\`);
    return {
      error: \`Dev script execution failed: \${errorMessage}\`
    };
  }
}

// Main execution
(async () => {
  try {
    // Run maintenance first, capture any errors but continue
    const maintenanceResult = await runMaintenanceScript();
    if (maintenanceResult.error) {
      console.error(\`[ORCHESTRATOR] Maintenance completed with error: \${maintenanceResult.error}\`);
    } else {
      console.log("[ORCHESTRATOR] Maintenance completed successfully");
    }

    // Always run dev script regardless of maintenance outcome
    const devResult = await startDevScript();
    if (devResult.error) {
      console.error(\`[ORCHESTRATOR] Dev script failed: \${devResult.error}\`);
      process.exit(1);
    } else {
      console.log("[ORCHESTRATOR] Dev script started successfully");
    }

    // Exit with success - maintenance errors don't affect overall success
    process.exit(0);
  } catch (error) {
    console.error(\`[ORCHESTRATOR] Fatal error: \${error}\`);
    process.exit(1);
  }
})();
`;

  // Create the command that sets up all scripts and runs the orchestrator
  const setupAndRunCommand = `set -eu
mkdir -p ${CMUX_RUNTIME_DIR}

# Write maintenance script if provided
${maintenanceScriptContent ? `cat > ${ids.maintenance.scriptPath} <<'MAINTENANCE_SCRIPT_EOF'
${maintenanceScriptContent}
MAINTENANCE_SCRIPT_EOF
chmod +x ${ids.maintenance.scriptPath}
rm -f ${maintenanceExitCodePath}` : ''}

# Write dev script if provided
${devScriptContent ? `cat > ${ids.dev.scriptPath} <<'DEV_SCRIPT_EOF'
${devScriptContent}
DEV_SCRIPT_EOF
chmod +x ${ids.dev.scriptPath}` : ''}

# Write orchestrator script
cat > ${orchestratorScriptPath} <<'ORCHESTRATOR_EOF'
${orchestratorScript}
ORCHESTRATOR_EOF
chmod +x ${orchestratorScriptPath}

# Run orchestrator with bun
bun ${orchestratorScriptPath}
`;

  try {
    const result = await instance.exec(
      `zsh -lc ${singleQuote(setupAndRunCommand)}`,
    );

    // Parse the output to determine maintenance and dev errors
    const stdout = result.stdout?.trim() || "";
    const stderr = result.stderr?.trim() || "";

    if (stdout.includes("[ORCHESTRATOR] Maintenance completed with error:")) {
      const match = stdout.match(/\[ORCHESTRATOR\] Maintenance completed with error: (.+)/);
      if (match) {
        maintenanceError = match[1];
      }
    }

    if (result.exit_code !== 0 || stdout.includes("[DEV] ERROR:") || stdout.includes("[ORCHESTRATOR] Dev script failed:")) {
      const devMatch = stdout.match(/\[(?:DEV|ORCHESTRATOR)\] (?:ERROR: |Dev script failed: )(.+)/);
      if (devMatch) {
        devError = devMatch[1];
      } else if (result.exit_code !== 0) {
        const messageParts = [
          `Script execution failed with exit code ${result.exit_code}`,
          stderr ? `stderr: ${stderr}` : null,
          stdout ? `stdout: ${stdout}` : null,
        ].filter((part): part is string => part !== null);
        devError = messageParts.join(" | ");
      }
    }

    if (result.exit_code === 0) {
      console.log(`[ORCHESTRATOR VERIFICATION]\n${stdout}`);
    }
  } catch (error) {
    devError = `Script orchestrator execution failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  return {
    maintenanceError,
    devError,
  };
}
