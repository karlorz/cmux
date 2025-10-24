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

/**
 * Orchestrates maintenance -> dev with a single instance.exec by writing a Bun script that:
 *  - ensures a 'cmux' tmux session exists,
 *  - launches maintenance in one tmux window and waits for completion,
 *  - only launches dev in another tmux window if maintenance succeeds,
 *  - logs all output and errors to /var/log/cmux/*.log.
 *
 * This returns after scheduling the detached orchestrator; detailed errors are written to logs.
 */
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

  // Prepare script file contents if provided
  const maintenanceScriptContent =
    maintenanceScript && maintenanceScript.trim().length > 0
      ? `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Maintenance Script Started at \\$(date) ==="
${maintenanceScript}
echo "=== Maintenance Script Completed at \\$(date) ==="`
      : null;

  const devScriptContent =
    devScript && devScript.trim().length > 0
      ? `#!/bin/zsh
set -eux
cd ${WORKSPACE_ROOT}

echo "=== Dev Script Started at \\$(date) ==="
${devScript}
echo "=== Dev Script Completed at \\$(date) ==="`
      : null;

  // Bun orchestrator (detached). Uses tmux windows (tabs) in a single session.
  // Minimal dependencies; relies on Bun's \`$\` and \`sleep\`.
  const orchestratorTs = String.raw`#!/usr/bin/env bun
import { $, sleep } from "bun";
import { existsSync, appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SESSION = process.env.ORCH_TMUX_SESSION || "cmux";
const RUNTIME_DIR = process.env.CMUX_RUNTIME_DIR || "/var/tmp/cmux-scripts";
const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT || "/root/workspace";
const MAINT_NAME = process.env.ORCH_MAINTENANCE_WINDOW_NAME || "maintenance";
const DEV_NAME = process.env.ORCH_DEV_WINDOW_NAME || "dev";
const MAINT_PATH = process.env.ORCH_MAINTENANCE_SCRIPT_PATH || "";
const DEV_PATH = process.env.ORCH_DEV_SCRIPT_PATH || "";
const LOG_DIR = process.env.CMUX_LOG_DIR || "/var/log/cmux";
const ORCH_LOG = process.env.ORCH_LOG_PATH || join(LOG_DIR, "cmux-orchestration.log");
const MAINT_LOG = join(LOG_DIR, "maintenance.log");
const DEV_LOG = join(LOG_DIR, "dev.log");
const RUN_ID = \`\${Date.now().toString(36)}_\${Math.random().toString(36).slice(2,10)}\`;
const MAINT_EXIT = \`\${MAINT_PATH}.\${RUN_ID}.exit-code\`;

function now() { return new Date().toISOString(); }

function log(msg: string) {
  try { appendFileSync(ORCH_LOG, \`[\${now()}] \${msg}\\n\`); } catch {}
  // also to stdout (captured by nohup redirection)
  console.log(\`[\${now()}] \${msg}\`);
}

async function ensureSession() {
  const res = await $\`tmux has-session -t \${SESSION}\`.nothrow();
  if (res.exitCode !== 0) {
    await $\`tmux new-session -d -s \${SESSION} -n bootstrap zsh\`;
    log(\`created tmux session '\${SESSION}'\`);
  } else {
    log(\`using existing tmux session '\${SESSION}'\`);
  }
}

async function startWindow(name: string, cmd: string) {
  await $\`tmux new-window -t \${SESSION}: -n \${name} -d\`;
  await $\`tmux send-keys -t \${SESSION}:\${name} \${cmd} C-m\`;
  log(\`started window '\${name}'\`);
}

async function main() {
  try {
    // Best-effort log dir; orchestrator assumes caller created it.
    try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}

    await ensureSession();

    let maintenanceExitCode = 0;

    if (MAINT_PATH && MAINT_PATH.length > 0) {
      const maintCmd = \`zsh -lc "cd \${WORKSPACE_ROOT} && zsh \${MAINT_PATH} >> \${MAINT_LOG} 2>&1; printf %s $? > \${MAINT_EXIT}; exec zsh"\`;
      log(\`[maintenance] launching '\${MAINT_NAME}'\`);
      await startWindow(MAINT_NAME, maintCmd);

      let waited = 0;
      while (!existsSync(MAINT_EXIT)) {
        await sleep(1000);
        waited++;
        if (waited % 60 === 0) log("[maintenance] still running...");
      }

      // Read exit code
      try {
        const txt = await (await Bun.file(MAINT_EXIT)).text();
        maintenanceExitCode = parseInt(txt.trim(), 10);
        if (!Number.isFinite(maintenanceExitCode)) maintenanceExitCode = 1;
      } catch {
        maintenanceExitCode = 1;
      }

      log(\`[maintenance] exit code \${maintenanceExitCode}\`);
    } else {
      log("[maintenance] skipped (no script)");
    }

    // Only start dev if maintenance succeeded
    if (maintenanceExitCode === 0) {
      if (DEV_PATH && DEV_PATH.length > 0) {
        const devCmd = \`zsh -lc "cd \${WORKSPACE_ROOT} && zsh \${DEV_PATH} >> \${DEV_LOG} 2>&1; exec zsh"\`;
        log(\`[dev] launching '\${DEV_NAME}'\`);
        await startWindow(DEV_NAME, devCmd);
      } else {
        log("[dev] skipped (no script)");
      }
    } else {
      log(\`[dev] skipped (maintenance failed with exit code \${maintenanceExitCode})\`);
    }

    log("orchestration complete");
  } catch (e) {
    log(\`[error] \${(e as any)?.stack || e}\`);
    process.exit(1);
  }
}

await main();
`;

  // Shell bootstrap that writes scripts + orchestrator and starts it detached with nohup.
  // Also resolves a log directory under /var/log (prefers /var/log/cmux).
  const bootstrapSh = `set -euo pipefail
mkdir -p ${CMUX_RUNTIME_DIR}

# --- Resolve a cmux log directory under /var/log ---
# Prefer /var/log/cmux, then /var/log/manaflow/cmux, then /var/log/manaflow, finally /var/log.
CMUX_LOG_DIR=""
for d in "/var/log/cmux" "/var/log/manaflow/cmux" "/var/log/manaflow" "/var/log"; do
  if [ -d "$d" ] || mkdir -p "$d" 2>/dev/null; then
    CMUX_LOG_DIR="$d"
    break
  fi
done
if [ -z "$CMUX_LOG_DIR" ]; then
  CMUX_LOG_DIR="/var/log"
fi

ORCH_LOG="$CMUX_LOG_DIR/cmux-orchestration.log"

# --- Write maintenance and dev scripts if provided ---
${
  maintenanceScriptContent
    ? `cat > ${ids.maintenance.scriptPath} <<'MAINT_EOF'
${maintenanceScriptContent}
MAINT_EOF
chmod +x ${ids.maintenance.scriptPath}`
    : `# no maintenance script provided
`
}
${
  devScriptContent
    ? `cat > ${ids.dev.scriptPath} <<'DEV_EOF'
${devScriptContent}
DEV_EOF
chmod +x ${ids.dev.scriptPath}`
    : `# no dev script provided
`
}

# --- Write Bun orchestrator ---
ORCH_TS_PATH="${CMUX_RUNTIME_DIR}/cmux-orchestrator.ts"
cat > "$ORCH_TS_PATH" <<'TS_EOF'
${orchestratorTs}
TS_EOF
chmod +x "$ORCH_TS_PATH"

# Ensure tmux exists and session is present (orchestrator also double-checks)
if ! command -v tmux >/dev/null 2>&1; then
  echo "[ORCH-BOOT] tmux not found" | tee -a "$ORCH_LOG" >&2
  exit 1
fi
if ! tmux has-session -t cmux 2>/dev/null; then
  tmux new-session -d -s cmux -n bootstrap zsh
fi

# Ensure Bun exists
if ! command -v bun >/dev/null 2>&1; then
  echo "[ORCH-BOOT] bun not found" | tee -a "$ORCH_LOG" >&2
  exit 1
fi

# Kick off orchestrator detached; all logs go to $ORCH_LOG
echo "[ORCH-BOOT] starting orchestrator $(date)" >> "$ORCH_LOG"
CMUX_LOG_DIR="$CMUX_LOG_DIR" \\
WORKSPACE_ROOT="${WORKSPACE_ROOT}" \\
CMUX_RUNTIME_DIR="${CMUX_RUNTIME_DIR}" \\
ORCH_TMUX_SESSION="cmux" \\
ORCH_MAINTENANCE_WINDOW_NAME="${ids.maintenance.windowName}" \\
ORCH_DEV_WINDOW_NAME="${ids.dev.windowName}" \\
ORCH_MAINTENANCE_SCRIPT_PATH="${maintenanceScriptContent ? ids.maintenance.scriptPath : ""}" \\
ORCH_DEV_SCRIPT_PATH="${devScriptContent ? ids.dev.scriptPath : ""}" \\
ORCH_LOG_PATH="$ORCH_LOG" \\
nohup bun run "$ORCH_TS_PATH" >> "$ORCH_LOG" 2>&1 &

# Emit where logs are so callers can surface it if needed
echo "CMUX_LOG_DIR=$CMUX_LOG_DIR"
`;

  try {
    const result = await instance.exec(`zsh -lc ${singleQuote(bootstrapSh)}`);

    if (result.exit_code !== 0) {
      const stderr = result.stderr?.trim() || "";
      const stdout = result.stdout?.trim() || "";
      const messageParts = [
        `Failed to bootstrap orchestrator (exit ${result.exit_code})`,
        stderr ? `stderr: ${stderr}` : null,
        stdout ? `stdout: ${stdout}` : null,
      ].filter((part): part is string => part !== null);

      return {
        maintenanceError: messageParts.join(" | "),
        devError: null,
      };
    }

    // Success: orchestrator is running detached; errors will be written to /var/log/cmux/*.log
    console.log(`[ORCHESTRATOR STARTED]\n${result.stdout || ""}`);
    return {
      maintenanceError: null,
      devError: null,
    };
  } catch (error) {
    return {
      maintenanceError: `Bootstrap failed: ${error instanceof Error ? error.message : String(error)}`,
      devError: null,
    };
  }
}
