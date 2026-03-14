/**
 * Electron main-process helpers for reading and writing host MCP configuration files.
 *
 * Exposes access to:
 *   - ~/.claude.json   (Claude Code global config, JSON)
 *   - ~/.codex/config.toml  (Codex CLI config, TOML)
 *   - ~/.config/opencode/opencode.json (OpenCode config, JSON)
 *
 * Returns raw file contents so that the renderer/shared layer can parse and
 * merge them without pulling Node fs APIs across the context bridge.
 *
 * Write operations create backups and use atomic writes for safety.
 */

import { readFile, writeFile, mkdir, rename, copyFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const MCP_HOST_CONFIG_IPC_CHANNELS = {
  readClaudeJson: "cmux:mcp-host-config:read-claude-json",
  readCodexToml: "cmux:mcp-host-config:read-codex-toml",
  readOpencodeJson: "cmux:mcp-host-config:read-opencode-json",
  writeClaudeJson: "cmux:mcp-host-config:write-claude-json",
  writeCodexToml: "cmux:mcp-host-config:write-codex-toml",
  writeOpencodeJson: "cmux:mcp-host-config:write-opencode-json",
} as const;

export interface HostMcpFileResult {
  /** true when the file was read successfully */
  ok: boolean;
  /** Raw file content (utf-8).  undefined when ok is false. */
  content?: string;
  /** Absolute path that was attempted */
  path: string;
  /** Human-readable error when ok is false */
  error?: string;
}

async function safeReadFile(filePath: string): Promise<HostMcpFileResult> {
  try {
    const content = await readFile(filePath, "utf-8");
    return { ok: true, content, path: filePath };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : String(err);
    return { ok: false, path: filePath, error: message };
  }
}

/**
 * Read ~/.claude.json (Claude Code global config).
 */
export function readClaudeJsonConfig(): Promise<HostMcpFileResult> {
  return safeReadFile(path.join(homedir(), ".claude.json"));
}

/**
 * Read ~/.codex/config.toml (Codex CLI config).
 */
export function readCodexTomlConfig(): Promise<HostMcpFileResult> {
  return safeReadFile(path.join(homedir(), ".codex", "config.toml"));
}

/**
 * Read ~/.config/opencode/opencode.json (OpenCode config).
 */
export function readOpencodeJsonConfig(): Promise<HostMcpFileResult> {
  return safeReadFile(path.join(homedir(), ".config", "opencode", "opencode.json"));
}

export interface HostMcpWriteResult {
  /** true when the file was written successfully */
  ok: boolean;
  /** Absolute path that was written */
  path: string;
  /** Path to backup file (if created) */
  backupPath?: string;
  /** Human-readable error when ok is false */
  error?: string;
}

/**
 * Safely write a file with backup and atomic write.
 * Creates parent directories if they don't exist.
 */
async function safeWriteFile(
  filePath: string,
  content: string,
): Promise<HostMcpWriteResult> {
  try {
    const dir = path.dirname(filePath);

    // Ensure parent directory exists
    await mkdir(dir, { recursive: true });

    // Create backup if file exists (direct copy, handle ENOENT)
    let backupPath: string | undefined;
    try {
      backupPath = `${filePath}.backup`;
      await copyFile(filePath, backupPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        throw err;
      }
      // File doesn't exist, no backup needed
      backupPath = undefined;
    }

    // Write to temp file first (atomic write)
    const tempPath = `${filePath}.tmp.${Date.now()}`;
    await writeFile(tempPath, content, "utf-8");

    // Rename temp to target (atomic on most filesystems)
    await rename(tempPath, filePath);

    return { ok: true, path: filePath, backupPath };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, path: filePath, error: message };
  }
}

/**
 * Write ~/.claude.json (Claude Code global config).
 */
export function writeClaudeJsonConfig(content: string): Promise<HostMcpWriteResult> {
  return safeWriteFile(path.join(homedir(), ".claude.json"), content);
}

/**
 * Write ~/.codex/config.toml (Codex CLI config).
 */
export function writeCodexTomlConfig(content: string): Promise<HostMcpWriteResult> {
  return safeWriteFile(path.join(homedir(), ".codex", "config.toml"), content);
}

/**
 * Write ~/.config/opencode/opencode.json (OpenCode config).
 */
export function writeOpencodeJsonConfig(content: string): Promise<HostMcpWriteResult> {
  return safeWriteFile(path.join(homedir(), ".config", "opencode", "opencode.json"), content);
}
