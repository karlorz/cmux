export type LocalTerminalTarget =
  | "terminal"
  | "iterm"
  | "ghostty"
  | "alacritty";

export type LocalClaudeLaunchStatus =
  | "launched"
  | "launch_failed"
  | "completed"
  | "completed_failed";

export type LocalClaudePluginDevLaunchRequest = {
  agentName: string;
  taskDescription: string;
  workspacePath: string;
  terminal: LocalTerminalTarget;
  claudeBinPath?: string;
  effort?: string;
  pluginDirs?: string[];
  settingsPath?: string;
  settingSources?: string[];
  mcpConfigs?: string[];
  allowedTools?: string;
  disallowedTools?: string;
};

function shellEscapeSingleQuotes(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function buildLocalClaudePluginDevCommand(
  request: LocalClaudePluginDevLaunchRequest,
): string {
  const parts: string[] = [];

  if (request.claudeBinPath?.trim()) {
    parts.push(
      `DEVSH_CLAUDE_BIN=${shellEscapeSingleQuotes(request.claudeBinPath.trim())}`,
    );
  }

  parts.push("devsh orchestrate run-local");
  parts.push(`--agent ${request.agentName}`);

  if (request.effort?.trim()) {
    parts.push(`--effort ${request.effort.trim()}`);
  }

  for (const pluginDir of request.pluginDirs ?? []) {
    const trimmed = pluginDir.trim();
    if (!trimmed) continue;
    parts.push(`--plugin-dir ${shellEscapeSingleQuotes(trimmed)}`);
  }

  if (request.workspacePath.trim()) {
    parts.push(
      `--workspace ${shellEscapeSingleQuotes(request.workspacePath.trim())}`,
    );
  }

  if (request.settingsPath?.trim()) {
    parts.push(`--settings ${shellEscapeSingleQuotes(request.settingsPath.trim())}`);
  }

  const settingSources = (request.settingSources ?? []).filter(Boolean);
  if (settingSources.length > 0) {
    parts.push(`--setting-sources ${settingSources.join(",")}`);
  }

  for (const mcpConfig of request.mcpConfigs ?? []) {
    const trimmed = mcpConfig.trim();
    if (!trimmed) continue;
    parts.push(`--mcp-config ${shellEscapeSingleQuotes(trimmed)}`);
  }

  if (request.allowedTools?.trim()) {
    parts.push(
      `--allowed-tools ${shellEscapeSingleQuotes(request.allowedTools.trim())}`,
    );
  }

  if (request.disallowedTools?.trim()) {
    parts.push(
      `--disallowed-tools ${shellEscapeSingleQuotes(
        request.disallowedTools.trim(),
      )}`,
    );
  }

  parts.push(shellEscapeSingleQuotes(request.taskDescription));

  return parts.join(" \\\n  ");
}
