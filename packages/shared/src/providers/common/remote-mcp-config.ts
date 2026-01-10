/**
 * Remote MCP Configuration for Sandbox Environments
 *
 * This module defines MCP server configurations that are specific to remote sandbox
 * environments. These configurations use "Connect Mode" to connect to already-running
 * services (like Chrome) instead of "Launch Mode" which spawns new instances.
 *
 * Problem Solved:
 * - User's local MCP configs use Launch Mode (spawns new processes via stdio)
 * - Remote sandboxes have pre-running services that MCP servers should connect to
 * - Syncing local configs directly causes failures because Launch Mode doesn't work
 *   when services are already running on specific ports
 *
 * Solution:
 * - Generate project-level MCP configs that override user-level configs
 * - Use Connect Mode with explicit URLs pointing to sandbox services
 * - Each agent (Claude Code, Codex CLI, Gemini CLI) has its own config format
 */

import type { AuthFile } from "../../worker-schemas";

/**
 * Configuration for a single MCP server in remote/sandbox mode.
 */
export interface RemoteMcpServerConfig {
  /** MCP server package name (e.g., "chrome-devtools-mcp@latest") */
  package: string;
  /** Command to run (usually "npx" or "bunx") */
  command: string;
  /** Arguments to pass to the MCP server */
  args: string[];
  /** Environment variables for this MCP server */
  env?: Record<string, string>;
}

/**
 * Pre-defined remote MCP server configurations for sandbox environments.
 *
 * These servers connect to already-running services in the sandbox:
 * - Chrome DevTools: Connects to Chrome via CDP proxy at localhost:39381
 *   (Chrome runs on 39382, CDP proxy on 39381 handles Host header validation)
 */
export const REMOTE_MCP_SERVERS: Record<string, RemoteMcpServerConfig> = {
  /**
   * Chrome DevTools MCP Server
   *
   * In sandbox environments, Chrome is already running with remote debugging enabled.
   * The CDP proxy (port 39381) forwards requests to Chrome (port 39382) and handles
   * the Host header validation that Chrome requires for security.
   */
  "chrome-devtools-9222": {
    package: "chrome-devtools-mcp@latest",
    command: "bunx",
    args: ["chrome-devtools-mcp@latest", "--browserUrl", "http://localhost:39381"],
    env: {},
  },
  /**
   * Chrome DevTools MCP Server (default instance name)
   * Same as above but with a different key for agents that use "chrome-devtools" as the name
   */
  "chrome-devtools-default": {
    package: "chrome-devtools-mcp@latest",
    command: "bunx",
    args: ["chrome-devtools-mcp@latest", "--browserUrl", "http://localhost:39381"],
    env: {},
  },
};

/**
 * Generate Claude Code .mcp.json content for remote/sandbox environments.
 *
 * Claude Code uses project-level .mcp.json which takes precedence over user-level.
 * By placing this in /root/workspace/.mcp.json, it overrides ~/.claude/.mcp.json
 * for the workspace without modifying the user's config.
 *
 * Format:
 * ```json
 * {
 *   "mcpServers": {
 *     "server-name": {
 *       "command": "bunx",
 *       "args": ["package@version", "--flag", "value"],
 *       "env": {}
 *     }
 *   }
 * }
 * ```
 */
export function generateClaudeCodeMcpJson(
  servers: Record<string, RemoteMcpServerConfig> = REMOTE_MCP_SERVERS
): string {
  const mcpServers: Record<
    string,
    { command: string; args: string[]; env?: Record<string, string> }
  > = {};

  for (const [name, config] of Object.entries(servers)) {
    mcpServers[name] = {
      command: config.command,
      args: config.args,
      ...(config.env && Object.keys(config.env).length > 0 ? { env: config.env } : {}),
    };
  }

  return JSON.stringify({ mcpServers }, null, 2);
}

/**
 * Generate Codex CLI config.toml MCP section for remote/sandbox environments.
 *
 * Codex CLI uses TOML format with [mcp_servers.<name>] sections.
 * This generates TOML content to append to the existing config.toml.
 *
 * Format:
 * ```toml
 * [mcp_servers.server-name]
 * command = "bunx"
 * args = ["package@version", "--flag", "value"]
 * ```
 */
export function generateCodexMcpToml(
  servers: Record<string, RemoteMcpServerConfig> = REMOTE_MCP_SERVERS
): string {
  const lines: string[] = [
    "",
    "# Remote MCP servers for sandbox environment",
    "# These connect to already-running services instead of spawning new ones",
  ];

  for (const [name, config] of Object.entries(servers)) {
    lines.push("");
    lines.push(`[mcp_servers.${name}]`);
    lines.push(`command = "${config.command}"`);
    // Format args as TOML array
    const argsStr = config.args.map((a) => `"${a.replace(/"/g, '\\"')}"`).join(", ");
    lines.push(`args = [${argsStr}]`);
    if (config.env && Object.keys(config.env).length > 0) {
      const envEntries = Object.entries(config.env)
        .map(([k, v]) => `"${k}" = "${v.replace(/"/g, '\\"')}"`)
        .join(", ");
      lines.push(`env = { ${envEntries} }`);
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate Gemini CLI settings.json MCP section for remote/sandbox environments.
 *
 * Gemini CLI MCP format is similar to Claude Code.
 * This generates a partial settings object to merge with existing settings.
 */
export function generateGeminiMcpConfig(
  servers: Record<string, RemoteMcpServerConfig> = REMOTE_MCP_SERVERS
): Record<string, { command: string; args: string[]; env?: Record<string, string> }> {
  const mcpServers: Record<
    string,
    { command: string; args: string[]; env?: Record<string, string> }
  > = {};

  for (const [name, config] of Object.entries(servers)) {
    mcpServers[name] = {
      command: config.command,
      args: config.args,
      ...(config.env && Object.keys(config.env).length > 0 ? { env: config.env } : {}),
    };
  }

  return mcpServers;
}

/**
 * Generate AuthFile for Claude Code project-level .mcp.json
 *
 * This file is placed in /root/workspace/.mcp.json to override user-level
 * MCP configurations with sandbox-specific Connect Mode settings.
 */
export function getClaudeCodeRemoteMcpFile(
  servers: Record<string, RemoteMcpServerConfig> = REMOTE_MCP_SERVERS
): AuthFile {
  const content = generateClaudeCodeMcpJson(servers);
  return {
    destinationPath: "/root/workspace/.mcp.json",
    contentBase64: Buffer.from(content).toString("base64"),
    mode: "644",
  };
}

/**
 * Generate TOML content to append to Codex CLI config.toml
 *
 * This should be appended to the existing config.toml content to add
 * sandbox-specific MCP server configurations.
 */
export function getCodexRemoteMcpTomlContent(
  servers: Record<string, RemoteMcpServerConfig> = REMOTE_MCP_SERVERS
): string {
  return generateCodexMcpToml(servers);
}
