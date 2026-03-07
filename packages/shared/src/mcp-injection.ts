import type { McpServerConfig } from "./mcp-server-config";

type JsonMcpServer = {
  command: string;
  args: string[];
  env?: Record<string, string>;
};

type OpencodeMcpServer = {
  type: "local";
  command: string[];
  enabled: true;
  env?: Record<string, string>;
};

function normalizeEnvVars(
  envVars?: Record<string, string>,
): Record<string, string> | undefined {
  if (!envVars) {
    return undefined;
  }

  const entries = Object.entries(envVars);
  if (entries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(entries);
}

function getUniqueConfigs(configs: McpServerConfig[]): McpServerConfig[] {
  const uniqueConfigs = new Map<string, McpServerConfig>();

  for (const config of configs) {
    uniqueConfigs.delete(config.name);
    uniqueConfigs.set(config.name, config);
  }

  return Array.from(uniqueConfigs.values());
}

function buildJsonMcpServers(
  configs: McpServerConfig[],
): Record<string, JsonMcpServer> {
  return getUniqueConfigs(configs).reduce<Record<string, JsonMcpServer>>(
    (servers, config) => {
      const env = normalizeEnvVars(config.envVars);
      servers[config.name] = env
        ? {
            command: config.command,
            args: [...config.args],
            env,
          }
        : {
            command: config.command,
            args: [...config.args],
          };
      return servers;
    },
    {},
  );
}

function formatTomlKeySegment(key: string): string {
  return /^[A-Za-z0-9_]+$/.test(key) ? key : JSON.stringify(key);
}

function formatTomlString(value: string): string {
  return JSON.stringify(value);
}

function formatTomlStringArray(values: string[]): string {
  return `[${values.map((value) => formatTomlString(value)).join(",")}]`;
}

export function buildClaudeMcpServers(
  configs: McpServerConfig[],
): Record<string, JsonMcpServer> {
  return buildJsonMcpServers(configs);
}

export function buildGeminiMcpServers(
  configs: McpServerConfig[],
): Record<string, JsonMcpServer> {
  return buildJsonMcpServers(configs);
}

export function buildCodexMcpToml(configs: McpServerConfig[]): string {
  return getUniqueConfigs(configs)
    .map((config) => {
      const key = formatTomlKeySegment(config.name);
      const lines = [
        `[mcp_servers.${key}]`,
        `type = "stdio"`,
        `command = ${formatTomlString(config.command)}`,
        `args = ${formatTomlStringArray(config.args)}`,
      ];

      const env = normalizeEnvVars(config.envVars);
      if (!env) {
        return lines.join("\n");
      }

      const envLines = Object.entries(env).map(
        ([envKey, envValue]) =>
          `${formatTomlKeySegment(envKey)} = ${formatTomlString(envValue)}`,
      );

      return [
        lines.join("\n"),
        "",
        `[mcp_servers.${key}.env]`,
        ...envLines,
      ].join("\n");
    })
    .join("\n\n");
}

export function buildOpencodeMcpConfig(
  configs: McpServerConfig[],
): Record<string, OpencodeMcpServer> {
  return getUniqueConfigs(configs).reduce<Record<string, OpencodeMcpServer>>(
    (servers, config) => {
      const env = normalizeEnvVars(config.envVars);
      servers[config.name] = env
        ? {
            type: "local",
            command: [config.command, ...config.args],
            enabled: true,
            env,
          }
        : {
            type: "local",
            command: [config.command, ...config.args],
            enabled: true,
          };
      return servers;
    },
    {},
  );
}
