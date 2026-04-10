/**
 * Provider Control Plane Types.
 *
 * These types define the shared contract for provider inventory, connection state,
 * and model availability across web, apps/server, and devsh.
 */

import type { AgentConfigApiKey } from "../../agentConfig";
import type { ClaudeRoutingConfig } from "../../provider-registry";
import type { ApiFormat } from "../base-providers";

export type ProviderOverrideShape = {
  baseUrl?: string;
  apiFormat?: ApiFormat;
  apiKeyEnvVar?: string;
  customHeaders?: Record<string, string>;
  fallbacks?: Array<{
    modelName: string;
    priority: number;
  }>;
  claudeRouting?: ClaudeRoutingConfig;
};

/**
 * Source of provider connection/authentication.
 * Tells operators HOW a provider became connected.
 */
export type ProviderConnectionSource =
  | "env" // Connected via environment variable
  | "stored_api_key" // Connected via team-stored API key (e.g., ANTHROPIC_API_KEY)
  | "stored_oauth_token" // Connected via team-stored OAuth token (e.g., CLAUDE_CODE_OAUTH_TOKEN)
  | "stored_json_blob" // Connected via team-stored JSON blob (e.g., CODEX_AUTH_JSON, OPENCODE_AUTH_JSON)
  | "override" // Connected via team provider override with custom endpoint
  | "free"; // Provider offers free tier (no auth required)

/**
 * Authentication method types supported by providers.
 * Used to generate dynamic auth forms in the UI.
 */
export type AuthMethodType =
  | "api_key" // Standard API key input
  | "oauth_token" // OAuth token (e.g., CLAUDE_CODE_OAUTH_TOKEN)
  | "json_blob" // JSON blob input (e.g., CODEX_AUTH_JSON, OPENCODE_AUTH_JSON)
  | "custom_endpoint"; // Custom endpoint configuration

/**
 * Authentication method specification.
 * Describes how to authenticate with a provider.
 */
export interface ProviderAuthMethod {
  /** Unique identifier for this auth method */
  id: string;
  /** Type of authentication */
  type: AuthMethodType;
  /** Human-readable name (e.g., "API Key", "OAuth Token") */
  displayName: string;
  /** Description shown in UI */
  description?: string;
  /** Associated API key definition */
  apiKey: AgentConfigApiKey;
  /** Whether this is the preferred auth method */
  preferred?: boolean;
  /** Placeholder text for input fields */
  placeholder?: string;
  /** Whether input should be multiline (for JSON blobs) */
  multiline?: boolean;
}

/**
 * Provider connection state.
 * Represents the current authentication status for a provider.
 */
export interface ProviderConnectionState {
  /** Whether the provider is currently connected/authenticated */
  isConnected: boolean;
  /** Source of the connection (how it was authenticated) */
  source: ProviderConnectionSource | null;
  /** Environment variables that are configured */
  configuredEnvVars: string[];
  /** Whether the provider has free models available (no auth required) */
  hasFreeModels: boolean;
  /** Timestamp of last successful connection verification */
  lastVerifiedAt?: number;
  /** Error message if connection failed */
  error?: string;
}

/**
 * Default model for a provider.
 * The recommended model to use when no specific model is selected.
 */
export interface ProviderDefaultModel {
  /** Model name/ID (e.g., "claude/opus-4.6") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Reason this is the default (e.g., "Most capable", "Best value") */
  reason?: string;
}

/**
 * Model availability in the control plane.
 * Represents a model with its connection requirements resolved.
 */
export interface ProviderControlPlaneModel {
  /** Model name/ID (e.g., "claude/opus-4.6") */
  name: string;
  /** Human-readable display name */
  displayName: string;
  /** Provider ID this model belongs to */
  providerId: string;
  /** Vendor for grouping in UI */
  vendor: string;
  /** Whether the model is currently available (provider connected) */
  isAvailable: boolean;
  /** Pricing tier */
  tier: "free" | "paid";
  /** Required API keys to use this model */
  requiredApiKeys: string[];
  /** Tags for filtering */
  tags: string[];
  /** Sort order for display */
  sortOrder: number;
  /** Optional model-specific effort/reasoning variants */
  variants?: Array<{
    id: string;
    displayName: string;
    description?: string;
  }>;
  /** Default effort/reasoning variant */
  defaultVariant?: string;
  /** Whether the model is disabled */
  disabled?: boolean;
  /** Reason the model is disabled */
  disabledReason?: string;
}

/**
 * Provider in the control plane.
 * Full provider specification with connection state and auth methods.
 */
export interface ProviderControlPlaneProvider {
  /** Provider ID (e.g., "anthropic", "openai", "opencode") */
  id: string;
  /** Human-readable name */
  name: string;
  /** Default API base URL */
  defaultBaseUrl: string;
  /** Effective base URL (may be overridden) */
  effectiveBaseUrl: string;
  /** API format */
  apiFormat: ApiFormat;
  /** Available authentication methods */
  authMethods: ProviderAuthMethod[];
  /** Current connection state */
  connectionState: ProviderConnectionState;
  /** Default model for this provider (when connected) */
  defaultModel?: ProviderDefaultModel;
  /** Whether this provider has team-specific overrides */
  isOverridden: boolean;
  /** Custom headers if overridden */
  customHeaders?: Record<string, string>;
  /** Claude-specific routing when configured on Anthropic-compatible gateways */
  claudeRouting?: ClaudeRoutingConfig;
}

/**
 * Control plane response for listing providers.
 */
export interface ProviderControlPlaneListResponse {
  /** All providers with their connection states */
  providers: ProviderControlPlaneProvider[];
  /** Timestamp when this data was generated */
  generatedAt: number;
}

/**
 * Control plane response for listing models.
 */
export interface ModelControlPlaneListResponse {
  /** Models matching the query */
  models: ProviderControlPlaneModel[];
  /** Default models by provider ID */
  defaultsByProvider: Record<string, ProviderDefaultModel>;
  /** View used for this response */
  view: "all" | "connected" | "vendor";
  /** Filter applied (provider ID if vendor view) */
  filter?: string;
  /** Timestamp of last model refresh */
  refreshedAt?: number;
  /** Timestamp when this data was generated */
  generatedAt: number;
}

/**
 * Options for listing models.
 */
export interface ModelListOptions {
  /** View mode */
  view?: "all" | "connected" | "vendor";
  /** Provider ID filter (for vendor view) */
  providerId?: string;
  /** Include disabled models */
  includeDisabled?: boolean;
}

/**
 * Discovery freshness state.
 * Tracks when provider model discovery was last run.
 */
export interface DiscoveryFreshness {
  /** Provider ID */
  providerId: string;
  /** Whether discovery data is considered stale */
  isStale: boolean;
  /** Last successful discovery timestamp */
  lastDiscoveredAt?: number;
  /** Discovery error if any */
  error?: string;
  /** Number of models discovered */
  modelCount: number;
}
