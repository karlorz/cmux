import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

// Target model for migrations - change this when a new latest model is released
const MIGRATION_TARGET_MODEL = "gpt-5.2-codex";

// Models to migrate (models without model_reasoning_effort support)
const MODELS_TO_MIGRATE = [
  "gpt-5.1-codex-max",
  "gpt-5.2",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "o3",
  "o4-mini",
  "gpt-4.1",
  "gpt-5-codex-mini",
];

/**
 * Generate model_migrations TOML section.
 * This maps deprecated/older models to the latest model to suppress deprecation notices.
 */
function generateModelMigrations(): string {
  const migrations = MODELS_TO_MIGRATE.map(
    (model) => `"${model}" = "${MIGRATION_TARGET_MODEL}"`
  ).join("\n");
  return `\n[notice.model_migrations]\n${migrations}\n`;
}

/**
 * Strip existing [notice.model_migrations] section from TOML.
 * TOML does not allow duplicate section headers, so we must remove any existing
 * section before appending our managed migrations.
 */
function stripModelMigrations(toml: string): string {
  // Match from [notice.model_migrations] to the next section header or EOF
  return toml.replace(/\[notice\.model_migrations\][\s\S]*?(?=\n\[|$)/g, "");
}

/**
 * Apply API keys for OpenAI Codex.
 *
 * Priority order:
 * 1. CODEX_AUTH_JSON - If provided, inject as ~/.codex/auth.json (OAuth tokens from `codex auth`)
 * 2. OPENAI_API_KEY - Fallback if no auth.json, injected as environment variable
 *
 * When CODEX_AUTH_JSON is provided, OPENAI_API_KEY is ignored since auth.json
 * contains OAuth tokens that Codex CLI prefers over API keys.
 */
export function applyCodexApiKeys(
  keys: Record<string, string>
): Partial<EnvironmentResult> {
  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};

  const authJson = keys.CODEX_AUTH_JSON;
  if (authJson) {
    // Validate that it's valid JSON before injecting
    try {
      JSON.parse(authJson);
      files.push({
        destinationPath: "$HOME/.codex/auth.json",
        contentBase64: Buffer.from(authJson).toString("base64"),
        mode: "600",
      });
      // Don't inject OPENAI_API_KEY when auth.json is provided
      return { files, env };
    } catch {
      console.warn("CODEX_AUTH_JSON is not valid JSON, skipping injection");
    }
  }

  // Fallback: inject OPENAI_API_KEY as environment variable
  // Also set CODEX_API_KEY to the same value to skip the sign-in screen
  // (OPENAI_API_KEY only pre-fills the input, CODEX_API_KEY bypasses it entirely)
  const openaiKey = keys.OPENAI_API_KEY;
  if (openaiKey) {
    env.OPENAI_API_KEY = openaiKey;
    env.CODEX_API_KEY = openaiKey;
  }

  return { files, env };
}

export async function getOpenAIEnvironment(
  _ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  // These must be lazy since configs are imported into the browser
  const { readFile } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { Buffer } = await import("node:buffer");

  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure .codex directory exists
  startupCommands.push("mkdir -p ~/.codex");
  // Ensure notify sink starts clean for this run; write JSONL under /root/lifecycle
  startupCommands.push("mkdir -p /root/lifecycle");
  startupCommands.push(
    "rm -f /root/workspace/.cmux/tmp/codex-turns.jsonl /root/workspace/codex-turns.jsonl /root/workspace/logs/codex-turns.jsonl /tmp/codex-turns.jsonl /tmp/cmux/codex-turns.jsonl /root/lifecycle/codex-turns.jsonl || true"
  );

  // Add a small notify handler script that appends the payload to JSONL and marks completion
  const notifyScript = `#!/usr/bin/env sh
set -eu
echo "$1" >> /root/lifecycle/codex-turns.jsonl
touch /root/lifecycle/codex-done.txt /root/lifecycle/done.txt
`;
  files.push({
    destinationPath: "/root/lifecycle/codex-notify.sh",
    contentBase64: Buffer.from(notifyScript).toString("base64"),
    mode: "755",
  });

  // List of files to copy from .codex directory
  // Note: We handle config.toml specially below to ensure required keys (e.g. notify) are present
  const codexFiles = [
    { name: "auth.json", mode: "600" },
    { name: "instructions.md", mode: "644" },
  ];

  // Try to copy each file
  for (const file of codexFiles) {
    try {
      const content = await readFile(
        `${homedir()}/.codex/${file.name}`,
        "utf-8"
      );
      files.push({
        destinationPath: `$HOME/.codex/${file.name}`,
        contentBase64: Buffer.from(content).toString("base64"),
        mode: file.mode,
      });
    } catch (error) {
      // File doesn't exist or can't be read, skip it
      console.warn(`Failed to read .codex/${file.name}:`, error);
    }
  }

  // Ensure config.toml exists and contains a notify hook pointing to our script
  // Also ensure model_migrations section is present with all managed migrations
  try {
    const rawToml = await readFile(`${homedir()}/.codex/config.toml`, "utf-8");
    const hasNotify = /(^|\n)\s*notify\s*=/.test(rawToml);
    // Start with notify hook if missing
    let tomlOut = hasNotify
      ? rawToml
      : `notify = ["/root/lifecycle/codex-notify.sh"]\n` + rawToml;
    // Strip any existing model_migrations and append our managed migrations
    tomlOut = stripModelMigrations(tomlOut) + generateModelMigrations();
    files.push({
      destinationPath: `$HOME/.codex/config.toml`,
      contentBase64: Buffer.from(tomlOut).toString("base64"),
      mode: "644",
    });
  } catch (_error) {
    // No host config.toml; create a minimal one that sets notify and model_migrations
    const toml =
      `notify = ["/root/lifecycle/codex-notify.sh"]\n` +
      generateModelMigrations();
    files.push({
      destinationPath: `$HOME/.codex/config.toml`,
      contentBase64: Buffer.from(toml).toString("base64"),
      mode: "644",
    });
  }

  return { files, env, startupCommands };
}
