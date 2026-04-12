import { z } from "@hono/zod-openapi";

export const ApiFormatSchema = z
  .enum(["anthropic", "openai", "bedrock", "vertex", "passthrough"])
  .openapi("ApiFormat");

export const FallbackSchema = z
  .object({
    modelName: z.string(),
    priority: z.number(),
  })
  .openapi("Fallback");

export const ClaudeAliasRouteSchema = z
  .object({
    model: z.string(),
    name: z.string().optional(),
    description: z.string().optional(),
    supportedCapabilities: z.array(z.string()).optional(),
  })
  .openapi("ClaudeAliasRoute");

export const ClaudeRoutingSchema = z
  .object({
    mode: z
      .enum(["direct_anthropic", "anthropic_compatible_gateway"])
      .openapi("ClaudeRoutingMode"),
    opus: ClaudeAliasRouteSchema.optional(),
    sonnet: ClaudeAliasRouteSchema.optional(),
    haiku: ClaudeAliasRouteSchema.optional(),
    subagentModel: z.string().optional(),
  })
  .openapi("ClaudeRouting");

export const ProviderOverrideSchema = z
  .object({
    _id: z.string(),
    teamId: z.string(),
    providerId: z.string(),
    baseUrl: z.string().optional(),
    apiFormat: ApiFormatSchema.optional(),
    apiKeyEnvVar: z.string().optional(),
    customHeaders: z.record(z.string(), z.string()).optional(),
    fallbacks: z.array(FallbackSchema).optional(),
    claudeRouting: ClaudeRoutingSchema.optional(),
    enabled: z.boolean(),
    createdAt: z.number(),
    updatedAt: z.number(),
  })
  .openapi("ProviderOverride");

export const ProviderListResponse = z
  .object({
    providers: z.array(ProviderOverrideSchema),
  })
  .openapi("ProviderListResponse");

export const UpsertProviderBody = z
  .object({
    baseUrl: z.string().optional(),
    apiFormat: ApiFormatSchema.optional(),
    apiKeyEnvVar: z.string().optional(),
    customHeaders: z.record(z.string(), z.string()).optional(),
    fallbacks: z.array(FallbackSchema).optional(),
    claudeRouting: ClaudeRoutingSchema.optional(),
    enabled: z.boolean(),
  })
  .openapi("UpsertProviderBody");

export const ProviderOverrideErrorResponse = z
  .object({
    code: z.string(),
    message: z.string(),
    details: z
      .object({
        providerId: z.string(),
        field: z.string(),
        reason: z.string(),
      })
      .optional(),
  })
  .openapi("ProviderOverrideErrorResponse");

export const SuccessResponse = z
  .object({
    success: z.boolean(),
  })
  .openapi("SuccessResponse");

export const UpsertResponse = z
  .object({
    id: z.string(),
    action: z.enum(["created", "updated"]),
  })
  .openapi("UpsertResponse");

export const TestResponse = z
  .object({
    success: z.boolean(),
    latencyMs: z.number().optional(),
    error: z.string().optional(),
  })
  .openapi("TestResponse");
