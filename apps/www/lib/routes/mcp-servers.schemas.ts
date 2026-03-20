import { MCP_SERVER_PRESETS } from "@cmux/shared";
import { z } from "@hono/zod-openapi";

export const ScopeSchema = z.enum(["global", "workspace"]).openapi("McpServerScope");
export const HeaderRecordSchema = z.record(z.string(), z.string());

const SupportedAgentsSchema = z
  .object({
    claude: z.boolean(),
    codex: z.boolean(),
    gemini: z.boolean(),
    opencode: z.boolean(),
  })
  .openapi("McpServerPresetSupportedAgents");

export const McpServerPresetSchema = z
  .object({
    name: z.string(),
    displayName: z.string(),
    description: z.string(),
    type: z.literal("stdio"),
    command: z.string(),
    args: z.array(z.string()),
    tags: z.array(z.string()),
    supportedAgents: SupportedAgentsSchema,
  })
  .openapi("McpServerPreset");

const McpServerBaseSchema = z.object({
  _id: z.string(),
  name: z.string(),
  displayName: z.string(),
  hasEnvVars: z.boolean().optional(),
  envVarKeys: z.array(z.string()).optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabledClaude: z.boolean(),
  enabledCodex: z.boolean(),
  enabledGemini: z.boolean(),
  enabledOpencode: z.boolean(),
  scope: ScopeSchema,
  projectFullName: z.string().optional(),
  sourcePresetId: z.string().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

const McpServerStdioSchema = McpServerBaseSchema.extend({
  type: z.literal("stdio"),
  command: z.string(),
  args: z.array(z.string()),
}).openapi("McpServerStdioConfig");

const McpServerRemoteFieldsSchema = {
  url: z.string(),
  headers: HeaderRecordSchema.optional(),
};

const McpServerHttpSchema = McpServerBaseSchema.extend({
  type: z.literal("http"),
  ...McpServerRemoteFieldsSchema,
}).openapi("McpServerHttpConfig");

const McpServerSseSchema = McpServerBaseSchema.extend({
  type: z.literal("sse"),
  ...McpServerRemoteFieldsSchema,
}).openapi("McpServerSseConfig");

export const McpServerConfigSchema = z
  .discriminatedUnion("type", [
    McpServerStdioSchema,
    McpServerHttpSchema,
    McpServerSseSchema,
  ])
  .openapi("McpServerConfig");

export const McpServersListResponse = z
  .object({
    configs: z.array(McpServerConfigSchema),
    presets: z.array(McpServerPresetSchema),
  })
  .openapi("McpServersListResponse");

export const McpServerListQuery = z
  .object({
    teamSlugOrId: z.string(),
    scope: ScopeSchema.optional(),
    projectFullName: z.string().optional(),
  })
  .openapi("McpServerListQuery");

const UpsertMcpServerStdioBody = z.object({
  name: z.string(),
  displayName: z.string(),
  type: z.literal("stdio").default("stdio"),
  command: z.string(),
  args: z.array(z.string()).default([]),
  envVars: HeaderRecordSchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabledClaude: z.boolean(),
  enabledCodex: z.boolean(),
  enabledGemini: z.boolean(),
  enabledOpencode: z.boolean(),
  sourcePresetId: z.string().optional(),
  scope: ScopeSchema,
  projectFullName: z.string().optional(),
});

const UpsertMcpServerRemoteFieldsSchema = {
  name: z.string(),
  displayName: z.string(),
  url: z.string(),
  headers: HeaderRecordSchema.optional(),
  envVars: HeaderRecordSchema.optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  enabledClaude: z.boolean(),
  enabledCodex: z.boolean(),
  enabledGemini: z.boolean(),
  enabledOpencode: z.boolean(),
  sourcePresetId: z.string().optional(),
  scope: ScopeSchema,
  projectFullName: z.string().optional(),
};

const UpsertMcpServerHttpBody = z.object({
  type: z.literal("http"),
  ...UpsertMcpServerRemoteFieldsSchema,
});

const UpsertMcpServerSseBody = z.object({
  type: z.literal("sse"),
  ...UpsertMcpServerRemoteFieldsSchema,
});

export const UpsertMcpServerBody = z
  .union([
    UpsertMcpServerStdioBody,
    UpsertMcpServerHttpBody,
    UpsertMcpServerSseBody,
  ])
  .openapi("UpsertMcpServerBody");

export const SuccessResponse = z
  .object({
    success: z.boolean(),
    id: z.string().optional(),
  })
  .openapi("McpServerSuccessResponse");

export function formatMcpServerPresetList() {
  return MCP_SERVER_PRESETS;
}

export function formatMcpServerConfigList(
  configs: Array<{
    _id: string;
    name: string;
    displayName: string;
    envVars?: Record<string, string>;
    description?: string;
    tags?: string[];
    enabledClaude: boolean;
    enabledCodex: boolean;
    enabledGemini: boolean;
    enabledOpencode: boolean;
    scope: "global" | "workspace";
    projectFullName?: string;
    sourcePresetId?: string;
    createdAt: number;
    updatedAt: number;
    type: "stdio" | "http" | "sse";
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
  }>,
) {
  return configs.map((config) => {
    const envVarKeys = config.envVars ? Object.keys(config.envVars) : [];
    const commonFields = {
      _id: config._id,
      name: config.name,
      displayName: config.displayName,
      hasEnvVars: envVarKeys.length > 0,
      envVarKeys,
      description: config.description,
      tags: config.tags,
      enabledClaude: config.enabledClaude,
      enabledCodex: config.enabledCodex,
      enabledGemini: config.enabledGemini,
      enabledOpencode: config.enabledOpencode,
      scope: config.scope,
      projectFullName: config.projectFullName,
      sourcePresetId: config.sourcePresetId,
      createdAt: config.createdAt,
      updatedAt: config.updatedAt,
    };

    if (config.type === "http" || config.type === "sse") {
      return {
        ...commonFields,
        type: config.type,
        url: config.url ?? "",
        headers: config.headers,
      };
    }

    return {
      ...commonFields,
      type: "stdio" as const,
      command: config.command ?? "",
      args: config.args ?? [],
    };
  });
}
