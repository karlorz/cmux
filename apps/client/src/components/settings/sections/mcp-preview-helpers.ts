import type { McpServerConfig as PreviewMcpServerConfig } from "@cmux/shared";
import type { McpServerConfig as StoredMcpServerConfig, Scope } from "@/lib/mcp-form-helpers";

export type McpPreviewAgent = "claude" | "codex" | "opencode";

const AGENT_ENABLED_FIELDS = {
  claude: "enabledClaude",
  codex: "enabledCodex",
  opencode: "enabledOpencode",
} satisfies Record<
  McpPreviewAgent,
  "enabledClaude" | "enabledCodex" | "enabledOpencode"
>;

function dedupeConfigsByName(
  configs: StoredMcpServerConfig[],
): StoredMcpServerConfig[] {
  const deduped = new Map<string, StoredMcpServerConfig>();

  for (const config of configs) {
    deduped.delete(config.name);
    deduped.set(config.name, config);
  }

  return Array.from(deduped.values());
}

function normalizePreviewConfig(
  config: StoredMcpServerConfig,
): PreviewMcpServerConfig {
  if (config.type === "http" || config.type === "sse") {
    return {
      name: config.name,
      type: config.type,
      url: config.url ?? "",
      ...(config.headers ? { headers: config.headers } : {}),
      ...(config.envVars ? { envVars: config.envVars } : {}),
    };
  }

  return {
    name: config.name,
    type: "stdio",
    command: config.command ?? "",
    args: config.args ?? [],
    ...(config.envVars ? { envVars: config.envVars } : {}),
  };
}

export function getWorkspacePreviewProjects(
  configs: StoredMcpServerConfig[],
): string[] {
  return Array.from(
    new Set(
      configs
        .filter(
          (config): config is StoredMcpServerConfig & { projectFullName: string } =>
            config.scope === "workspace" && typeof config.projectFullName === "string",
        )
        .map((config) => config.projectFullName),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function deriveEffectiveMcpConfigs(
  configs: StoredMcpServerConfig[],
  scope: Scope,
  agent: McpPreviewAgent,
  workspaceProjectFullName?: string,
): PreviewMcpServerConfig[] {
  const enabledField = AGENT_ENABLED_FIELDS[agent];
  const globalConfigs = dedupeConfigsByName(
    configs.filter((config) => config.scope === "global"),
  );

  if (scope === "global") {
    return globalConfigs
      .filter((config) => config[enabledField])
      .map(normalizePreviewConfig);
  }

  if (!workspaceProjectFullName) {
    return globalConfigs
      .filter((config) => config[enabledField])
      .map(normalizePreviewConfig);
  }

  const workspaceConfigs = dedupeConfigsByName(
    configs.filter(
      (config) =>
        config.scope === "workspace" &&
        config.projectFullName === workspaceProjectFullName,
    ),
  );

  const mergedConfigs = new Map<string, StoredMcpServerConfig>();
  for (const config of globalConfigs) {
    mergedConfigs.set(config.name, config);
  }
  for (const config of workspaceConfigs) {
    mergedConfigs.set(config.name, config);
  }

  return Array.from(mergedConfigs.values())
    .filter((config) => config[enabledField])
    .map(normalizePreviewConfig);
}
