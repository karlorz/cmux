/**
 * Provider Control Plane Service.
 *
 * Resolves provider inventory from ProviderRegistry plus enabled team overrides.
 * Generates auth methods dynamically from provider metadata and stored credential types.
 */

import type { AgentConfigApiKey } from "../../agentConfig";
import { AGENT_CATALOG } from "../../agent-catalog";
import {
  getProviderIdFromAgentName,
  type ProviderSpec,
} from "../base-providers";
import type { ProviderOverride } from "../../provider-registry";
import {
  type AuthMethodType,
  type ProviderAuthMethod,
  type ProviderConnectionSource,
  type ProviderConnectionState,
  type ProviderControlPlaneProvider,
  type ProviderDefaultModel,
  type ProviderControlPlaneModel,
  type ProviderControlPlaneListResponse,
  type ModelControlPlaneListResponse,
  type ModelListOptions,
  type DiscoveryFreshness,
} from "./types";

/**
 * Stored API keys from the apiKeys table.
 * Maps environment variable name to its stored value.
 */
export type StoredApiKeys = Record<string, string>;

/**
 * Model data from the models table.
 */
export interface StoredModel {
  name: string;
  displayName: string;
  vendor: string;
  source: "curated" | "discovered";
  requiredApiKeys: string[];
  tier: "free" | "paid";
  tags: string[];
  enabled: boolean;
  sortOrder: number;
  variants?: Array<{
    id: string;
    displayName: string;
    description?: string;
  }>;
  defaultVariant?: string;
  disabled?: boolean;
  disabledReason?: string;
  discoveredAt?: number;
  discoveredFrom?: string;
}

/**
 * Context for control plane operations.
 */
export interface ControlPlaneContext {
  /** Stored API keys for the team/user */
  storedApiKeys: StoredApiKeys;
  /** Provider overrides for the team */
  providerOverrides: ProviderOverride[];
  /** Models from the models table */
  models: StoredModel[];
}

// Well-known OAuth token environment variables
const OAUTH_TOKEN_ENV_VARS = new Set(["CLAUDE_CODE_OAUTH_TOKEN"]);

// Well-known JSON blob environment variables
const JSON_BLOB_ENV_VARS = new Set(["CODEX_AUTH_JSON", "OPENCODE_AUTH_JSON"]);

function catalogDefinesVariants(
  catalogEntry: (typeof AGENT_CATALOG)[number] | undefined,
): boolean {
  return (
    catalogEntry !== undefined &&
    Object.prototype.hasOwnProperty.call(catalogEntry, "variants")
  );
}

function catalogDefinesDefaultVariant(
  catalogEntry: (typeof AGENT_CATALOG)[number] | undefined,
): boolean {
  return (
    catalogEntry !== undefined &&
    Object.prototype.hasOwnProperty.call(catalogEntry, "defaultVariant")
  );
}

export function isAuthFreeModel(
  model: Pick<StoredModel, "tier" | "requiredApiKeys">,
): boolean {
  return (
    model.tier === "free" &&
    (!model.requiredApiKeys || model.requiredApiKeys.length === 0)
  );
}

function getModelProviderId(
  model: Pick<StoredModel, "name" | "vendor">,
): string {
  return getProviderIdFromAgentName(model.name) ?? model.vendor;
}

function hasAuthFreeModels(providerId: string, models: StoredModel[]): boolean {
  return models.some(
    (model) =>
      getModelProviderId(model) === providerId && isAuthFreeModel(model),
  );
}

/**
 * Determines the auth method type from an API key definition.
 */
function getAuthMethodType(apiKey: AgentConfigApiKey): AuthMethodType {
  if (OAUTH_TOKEN_ENV_VARS.has(apiKey.envVar)) {
    return "oauth_token";
  }
  if (JSON_BLOB_ENV_VARS.has(apiKey.envVar)) {
    return "json_blob";
  }
  return "api_key";
}

/**
 * Determines the connection source from configured environment variables.
 */
function getConnectionSource(
  configuredEnvVars: string[],
  hasOverride: boolean,
  hasFreeModels: boolean,
): ProviderConnectionSource | null {
  // Check override first
  if (hasOverride) {
    return "override";
  }

  // Check for OAuth tokens
  for (const envVar of configuredEnvVars) {
    if (OAUTH_TOKEN_ENV_VARS.has(envVar)) {
      return "stored_oauth_token";
    }
  }

  // Check for JSON blobs
  for (const envVar of configuredEnvVars) {
    if (JSON_BLOB_ENV_VARS.has(envVar)) {
      return "stored_json_blob";
    }
  }

  // Check for API keys
  if (configuredEnvVars.length > 0) {
    return "stored_api_key";
  }

  // Check for free tier
  if (hasFreeModels) {
    return "free";
  }

  return null;
}

/**
 * Generates auth methods from a provider spec's API keys.
 */
function generateAuthMethods(providerSpec: ProviderSpec): ProviderAuthMethod[] {
  const methods: ProviderAuthMethod[] = [];

  for (let i = 0; i < providerSpec.apiKeys.length; i++) {
    const apiKey = providerSpec.apiKeys[i];
    const type = getAuthMethodType(apiKey);

    methods.push({
      id: `${providerSpec.id}-${apiKey.envVar}`,
      type,
      displayName: getAuthMethodDisplayName(type, apiKey),
      description: apiKey.description,
      apiKey,
      preferred: i === 0, // First key is preferred
      placeholder: getAuthMethodPlaceholder(type),
      multiline: type === "json_blob",
    });
  }

  // Add custom endpoint method if provider has base URL key
  if (providerSpec.baseUrlKey) {
    methods.push({
      id: `${providerSpec.id}-custom-endpoint`,
      type: "custom_endpoint",
      displayName: "Custom Endpoint",
      description: providerSpec.baseUrlKey.description,
      apiKey: providerSpec.baseUrlKey,
      placeholder: (providerSpec.baseUrlKey as { placeholder?: string })
        .placeholder,
    });
  }

  return methods;
}

/**
 * Gets display name for an auth method.
 */
function getAuthMethodDisplayName(
  type: AuthMethodType,
  apiKey: AgentConfigApiKey,
): string {
  switch (type) {
    case "oauth_token":
      return "OAuth Token";
    case "json_blob":
      return apiKey.displayName || "Auth JSON";
    case "custom_endpoint":
      return "Custom Endpoint";
    default:
      return apiKey.displayName || "API Key";
  }
}

/**
 * Gets placeholder text for an auth method input.
 */
function getAuthMethodPlaceholder(type: AuthMethodType): string | undefined {
  switch (type) {
    case "oauth_token":
      return "Paste OAuth token here...";
    case "json_blob":
      return '{"access_token": "...", ...}';
    case "custom_endpoint":
      return "https://api.example.com/v1";
    default:
      return "sk-...";
  }
}

/**
 * Resolves connection state for a provider.
 */
function resolveConnectionState(
  providerSpec: ProviderSpec,
  storedApiKeys: StoredApiKeys,
  hasOverride: boolean,
  models: StoredModel[],
): ProviderConnectionState {
  const configuredEnvVars = providerSpec.authEnvVars.filter(
    (envVar) => storedApiKeys[envVar] !== undefined,
  );

  const hasFreeModels = hasAuthFreeModels(providerSpec.id, models);
  const source = getConnectionSource(
    configuredEnvVars,
    hasOverride,
    hasFreeModels,
  );
  const isConnected = source !== null;

  return {
    isConnected,
    source,
    configuredEnvVars,
    hasFreeModels,
  };
}

/**
 * Resolves a provider to its control plane representation.
 */
export function resolveControlPlaneProvider(
  providerSpec: ProviderSpec,
  storedApiKeys: StoredApiKeys,
  providerOverrides: ProviderOverride[],
  models: StoredModel[],
  defaultModel?: ProviderDefaultModel,
): ProviderControlPlaneProvider {
  // Find any enabled override for this provider
  const override = providerOverrides.find(
    (o) => o.providerId === providerSpec.id && o.enabled,
  );

  const hasOverride = override !== undefined;
  const connectionState = resolveConnectionState(
    providerSpec,
    storedApiKeys,
    hasOverride,
    models,
  );

  return {
    id: providerSpec.id,
    name: providerSpec.name,
    defaultBaseUrl: providerSpec.defaultBaseUrl,
    effectiveBaseUrl: override?.baseUrl ?? providerSpec.defaultBaseUrl,
    apiFormat: override?.apiFormat ?? providerSpec.apiFormat,
    authMethods: generateAuthMethods(providerSpec),
    connectionState,
    defaultModel: connectionState.isConnected ? defaultModel : undefined,
    isOverridden: hasOverride,
    customHeaders: override?.customHeaders,
  };
}

/**
 * Resolves model availability based on provider connection state.
 */
export function resolveControlPlaneModel(
  model: StoredModel,
  connectedProviders: Set<string>,
): ProviderControlPlaneModel {
  const providerId = getModelProviderId(model);
  const catalogEntry = AGENT_CATALOG.find((entry) => entry.name === model.name);
  const hasCatalogVariants = catalogDefinesVariants(catalogEntry);
  const hasCatalogDefaultVariant = catalogDefinesDefaultVariant(catalogEntry);

  // Model is available if:
  // 1. Provider is connected, OR
  // 2. Model is free tier and requires no auth
  const isAvailable =
    connectedProviders.has(providerId) || isAuthFreeModel(model);

  return {
    name: model.name,
    displayName: model.displayName,
    providerId,
    vendor: model.vendor,
    isAvailable,
    tier: model.tier,
    requiredApiKeys: model.requiredApiKeys,
    tags: model.tags,
    sortOrder: model.sortOrder,
    ...(hasCatalogVariants
      ? { variants: catalogEntry?.variants }
      : model.variants
        ? { variants: model.variants }
        : {}),
    ...(hasCatalogDefaultVariant
      ? { defaultVariant: catalogEntry?.defaultVariant }
      : !catalogEntry && model.defaultVariant
        ? { defaultVariant: model.defaultVariant }
        : {}),
    disabled: model.disabled,
    disabledReason: model.disabledReason,
  };
}

/**
 * Gets default model for a provider from available models.
 */
function getProviderDefaultModel(
  providerId: string,
  models: StoredModel[],
): ProviderDefaultModel | undefined {
  // Filter to this provider's models that are enabled and not disabled
  const providerModels = models
    .filter((m) => m.vendor === providerId && m.enabled && !m.disabled)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  if (providerModels.length === 0) {
    return undefined;
  }

  // Return the first (highest priority) model
  const defaultModel = providerModels[0];
  return {
    name: defaultModel.name,
    displayName: defaultModel.displayName,
    reason: defaultModel.sortOrder === 0 ? "Recommended" : undefined,
  };
}

/**
 * Lists all providers with their control plane state.
 */
export function listProviders(
  baseProviders: ProviderSpec[],
  ctx: ControlPlaneContext,
): ProviderControlPlaneListResponse {
  const providers: ProviderControlPlaneProvider[] = [];

  for (const providerSpec of baseProviders) {
    const defaultModel = getProviderDefaultModel(providerSpec.id, ctx.models);
    const provider = resolveControlPlaneProvider(
      providerSpec,
      ctx.storedApiKeys,
      ctx.providerOverrides,
      ctx.models,
      defaultModel,
    );
    providers.push(provider);
  }

  return {
    providers,
    generatedAt: Date.now(),
  };
}

/**
 * Lists models with availability resolved.
 */
export function listModels(
  baseProviders: ProviderSpec[],
  ctx: ControlPlaneContext,
  options: ModelListOptions = {},
): ModelControlPlaneListResponse {
  const { view = "connected", providerId, includeDisabled = false } = options;

  // Determine connected providers
  const connectedProviders = new Set<string>();
  for (const providerSpec of baseProviders) {
    const override = ctx.providerOverrides.find(
      (o) => o.providerId === providerSpec.id && o.enabled,
    );
    const connectionState = resolveConnectionState(
      providerSpec,
      ctx.storedApiKeys,
      override !== undefined,
      ctx.models,
    );
    if (connectionState.isConnected) {
      connectedProviders.add(providerSpec.id);
    }
  }

  // Resolve all models
  let models = ctx.models
    .filter((m) => m.enabled && (includeDisabled || !m.disabled))
    .map((m) => resolveControlPlaneModel(m, connectedProviders))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // Apply view filter
  switch (view) {
    case "connected":
      models = models.filter((m) => m.isAvailable);
      break;
    case "vendor":
      if (providerId) {
        models = models.filter((m) => m.providerId === providerId);
      }
      break;
    case "all":
      // No filter
      break;
  }

  // Build defaults by provider
  const defaultsByProvider: Record<string, ProviderDefaultModel> = {};
  for (const providerSpec of baseProviders) {
    const defaultModel = getProviderDefaultModel(providerSpec.id, ctx.models);
    if (defaultModel) {
      defaultsByProvider[providerSpec.id] = defaultModel;
    }
  }

  return {
    models,
    defaultsByProvider,
    view,
    filter: providerId,
    generatedAt: Date.now(),
  };
}

/**
 * Computes discovery freshness for providers.
 */
export function computeDiscoveryFreshness(
  baseProviders: ProviderSpec[],
  ctx: ControlPlaneContext,
  staleDurationMs: number = 24 * 60 * 60 * 1000, // 24 hours
): DiscoveryFreshness[] {
  const now = Date.now();
  const result: DiscoveryFreshness[] = [];

  // Providers that support discovery
  const discoveryProviders = new Set(["opencode", "openrouter"]);

  for (const providerSpec of baseProviders) {
    if (!discoveryProviders.has(providerSpec.id)) {
      continue;
    }

    // Find discovered models for this provider
    const discoveredModels = ctx.models.filter(
      (m) => m.vendor === providerSpec.id && m.source === "discovered",
    );

    const lastDiscoveredAt = discoveredModels.reduce(
      (max, m) => Math.max(max, m.discoveredAt ?? 0),
      0,
    );

    const isStale =
      discoveredModels.length === 0 ||
      (lastDiscoveredAt > 0 && now - lastDiscoveredAt > staleDurationMs);

    result.push({
      providerId: providerSpec.id,
      isStale,
      lastDiscoveredAt: lastDiscoveredAt > 0 ? lastDiscoveredAt : undefined,
      modelCount: discoveredModels.length,
    });
  }

  return result;
}
