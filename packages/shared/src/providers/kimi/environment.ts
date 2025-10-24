import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

export async function getKimiEnvironment(
  _ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  const { readFile } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const { Buffer } = await import("node:buffer");

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure .kimi directory exists
  startupCommands.push("mkdir -p ~/.kimi");

  // Create lifecycle directory for completion marker
  startupCommands.push("mkdir -p /root/lifecycle/kimi");

  // Clean up any old completion markers from previous runs
  startupCommands.push("rm -f /root/lifecycle/kimi-complete-* 2>/dev/null || true");

  // Try to copy Kimi config file if it exists on the host
  const kimiDir = join(homedir(), ".kimi");
  const configPath = join(kimiDir, "config.json");

  try {
    const configContent = await readFile(configPath, "utf-8");
    files.push({
      destinationPath: "$HOME/.kimi/config.json",
      contentBase64: Buffer.from(configContent).toString("base64"),
      mode: "600",
    });
  } catch {
    // Config file doesn't exist; that's okay, Kimi will prompt or use env vars
  }

  // Create a completion hook script that Kimi can call when done
  const completionHook = `#!/bin/bash
MARKER_FILE="/root/lifecycle/kimi-complete-\${CMUX_TASK_RUN_ID:-unknown}"
touch "\${MARKER_FILE}"
echo "[CMUX] Kimi session complete" >&2
exit 0`;

  files.push({
    destinationPath: "/root/lifecycle/kimi/completion-hook.sh",
    contentBase64: Buffer.from(completionHook).toString("base64"),
    mode: "755",
  });

  return { files, env, startupCommands };
}
