/**
 * Provider Registry for dynamic provider loading and per-team customization.
 *
 * Enables teams to customize base URLs, API formats, and fallback chains
 * for AI providers like Anthropic, OpenAI, and custom proxies.
 */

import type { AgentConfigApiKey } from "./agentConfig";
import {
  BASE_PROVIDERS,
  BASE_PROVIDER_MAP,
  getBaseProvider,
  getProviderIdFromAgentName,
  type ApiFormat,
  type ProviderSpec,
} from "./providers/base-providers";
import { getPluginLoader } from "./providers/plugin-loader";

export { type ApiFormat, type ProviderSpec };

export interface ClaudeAliasRoute {
  model: string;
  name?: string;
  description?: string;
  supportedCapabilities?: string[];
}

export interface ClaudeRoutingConfig {
  mode: "direct_anthropic" | "anthropic_compatible_gateway";
  opus?: ClaudeAliasRoute;
  sonnet?: ClaudeAliasRoute;
  haiku?: ClaudeAliasRoute;
  subagentModel?: string;
}

/**
 * Feature flag for enabling dynamic plugin loading.
 * When true, ProviderRegistry uses the PluginLoader for provider resolution.
 */
const USE_DYNAMIC_LOADING = process.env.CMUX_DYNAMIC_PLUGINS === "true";

/**
 * Provider override configuration stored per-team in Convex.
 * Matches the providerOverrides table schema.
 */
export interface ProviderOverride {
  teamId: string;
  providerId: string;
  baseUrl?: string;
  apiFormat?: ApiFormat;
  apiKeyEnvVar?: string;
  customHeaders?: Record<string, string>;
  fallbacks?: Array<{
    modelName: string;
    priority: number;
  }>;
  claudeRouting?: ClaudeRoutingConfig;
  enabled: boolean;
}

/**
 * Resolved provider configuration after merging base spec with team overrides.
 */
export interface ResolvedProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiFormat: ApiFormat;
  authEnvVars: string[];
  apiKeys: AgentConfigApiKey[];
  customHeaders?: Record<string, string>;
  fallbacks?: Array<{
    modelName: string;
    priority: number;
  }>;
  claudeRouting?: ClaudeRoutingConfig;
  isOverridden: boolean;
}

function hasClaudeRouteTarget(route: ClaudeAliasRoute | undefined): boolean {
  return Boolean(route?.model.trim());
}

export function validateClaudeRoutingOverride(
  override: Pick<
    ProviderOverride,
    "providerId" | "baseUrl" | "apiFormat" | "claudeRouting"
  >,
): void {
  const routing = override.claudeRouting;
  if (!routing) {
    return;
  }

  if (override.providerId !== "anthropic") {
    throw new Error("Claude routing is only supported for the anthropic provider");
  }

  if (override.apiFormat && override.apiFormat !== "anthropic") {
    throw new Error(
      "Claude routing requires an anthropic-compatible API format",
    );
  }

  const hasAliasTarget =
    hasClaudeRouteTarget(routing.opus) ||
    hasClaudeRouteTarget(routing.sonnet) ||
    hasClaudeRouteTarget(routing.haiku);
  const hasSubagentModel = Boolean(routing.subagentModel?.trim());

  if (routing.mode === "direct_anthropic") {
    if (hasAliasTarget || hasSubagentModel) {
      throw new Error(
        "direct_anthropic routing cannot define alias remaps or a subagent model",
      );
    }
    return;
  }

  if (!override.baseUrl?.trim()) {
    throw new Error(
      "anthropic_compatible_gateway routing requires a custom baseUrl",
    );
  }

  if (!hasAliasTarget && !hasSubagentModel) {
    throw new Error(
      "anthropic_compatible_gateway routing must define at least one alias remap or subagent model",
    );
  }
}

/**
 * Provider Registry for resolving providers with team customizations.
 */
export class ProviderRegistry {
  private baseProviders: Map<string, ProviderSpec>;
  private pluginLoader = getPluginLoader();
  private initialized = false;

  constructor() {
    this.baseProviders = new Map(BASE_PROVIDERS.map((p) => [p.id, p]));
  }

  /**
   * Initialize the registry with dynamic plugin loading if enabled.
   * Safe to call multiple times.
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (USE_DYNAMIC_LOADING) {
      await this.pluginLoader.loadAll();
      // Merge plugin provider specs into base providers
      for (const spec of this.pluginLoader.getAllProviderSpecs()) {
        this.baseProviders.set(spec.id, spec);
      }
    }

    this.initialized = true;
  }

  /**
   * Get all base provider IDs.
   */
  getProviderIds(): string[] {
    return Array.from(this.baseProviders.keys());
  }

  /**
   * Get a base provider spec by ID.
   * Falls back to static BASE_PROVIDER_MAP if dynamic loading is disabled or plugin not found.
   */
  getBaseProvider(providerId: string): ProviderSpec | undefined {
    // First check the merged map (includes plugins if initialized)
    const fromMap = this.baseProviders.get(providerId);
    if (fromMap) {
      return fromMap;
    }

    // If dynamic loading enabled and we have a loaded plugin, use its spec
    if (USE_DYNAMIC_LOADING && this.pluginLoader.isLoaded()) {
      const plugin = this.pluginLoader.getPlugin(providerId);
      if (plugin) {
        return {
          id: plugin.manifest.id,
          name: plugin.manifest.name,
          defaultBaseUrl: plugin.provider.defaultBaseUrl,
          apiFormat: plugin.provider.apiFormat,
          authEnvVars: plugin.provider.authEnvVars,
          apiKeys: plugin.provider.apiKeys,
          baseUrlKey: plugin.provider.baseUrlKey,
        };
      }
    }

    // Fallback to static map
    return BASE_PROVIDER_MAP[providerId];
  }

  /**
   * Resolve a provider configuration with optional team overrides.
   *
   * @param providerId - The provider ID (e.g., "anthropic", "openai")
   * @param teamOverride - Optional team-specific override
   * @returns Resolved provider configuration
   */
  resolve(providerId: string, teamOverride?: ProviderOverride): ResolvedProvider {
    const baseProvider = this.baseProviders.get(providerId);

    // If no base provider exists, create a custom provider from the override
    if (!baseProvider) {
      if (!teamOverride) {
        throw new Error(`Unknown provider: ${providerId}`);
      }
      return this.createCustomProvider(teamOverride);
    }

    // If no override, return the base provider as-is
    if (!teamOverride) {
      return {
        id: baseProvider.id,
        name: baseProvider.name,
        baseUrl: baseProvider.defaultBaseUrl,
        apiFormat: baseProvider.apiFormat,
        authEnvVars: baseProvider.authEnvVars,
        apiKeys: baseProvider.apiKeys,
        isOverridden: false,
      };
    }

    // Merge base provider with overrides
    return {
      id: baseProvider.id,
      name: baseProvider.name,
      baseUrl: teamOverride.baseUrl ?? baseProvider.defaultBaseUrl,
      apiFormat: teamOverride.apiFormat ?? baseProvider.apiFormat,
      authEnvVars: teamOverride.apiKeyEnvVar
        ? [teamOverride.apiKeyEnvVar]
        : baseProvider.authEnvVars,
      apiKeys: baseProvider.apiKeys,
      customHeaders: teamOverride.customHeaders,
      fallbacks: teamOverride.fallbacks,
      claudeRouting: teamOverride.claudeRouting,
      isOverridden: true,
    };
  }

  /**
   * Create a custom provider from an override (for proxies not in base providers).
   */
  private createCustomProvider(override: ProviderOverride): ResolvedProvider {
    return {
      id: override.providerId,
      name: override.providerId, // Use ID as name for custom providers
      baseUrl: override.baseUrl ?? "",
      apiFormat: override.apiFormat ?? "openai",
      authEnvVars: override.apiKeyEnvVar ? [override.apiKeyEnvVar] : [],
      apiKeys: [],
      customHeaders: override.customHeaders,
      fallbacks: override.fallbacks,
      claudeRouting: override.claudeRouting,
      isOverridden: true,
    };
  }

  /**
   * Get provider ID for a given agent name.
   */
  getProviderIdForAgent(agentName: string): string | undefined {
    return getProviderIdFromAgentName(agentName);
  }

  /**
   * Find the matching override for a provider from a list of team overrides.
   */
  findOverride(
    providerId: string,
    teamOverrides: ProviderOverride[]
  ): ProviderOverride | undefined {
    return teamOverrides.find(
      (o) => o.providerId === providerId && o.enabled
    );
  }

  /**
   * Resolve provider for a specific agent name with team overrides.
   *
   * @param agentName - The agent name (e.g., "claude/opus-4.6")
   * @param teamOverrides - Array of team-specific overrides
   * @returns Resolved provider or undefined if agent's provider is not found
   */
  resolveForAgent(
    agentName: string,
    teamOverrides: ProviderOverride[]
  ): ResolvedProvider | undefined {
    const providerId = this.getProviderIdForAgent(agentName);
    if (!providerId) {
      return undefined;
    }

    const override = this.findOverride(providerId, teamOverrides);
    return this.resolve(providerId, override);
  }
}

// Singleton instance for convenience
let registryInstance: ProviderRegistry | null = null;

/**
 * Get the singleton ProviderRegistry instance.
 */
export function getProviderRegistry(): ProviderRegistry {
  if (!registryInstance) {
    registryInstance = new ProviderRegistry();
  }
  return registryInstance;
}

// Re-export utilities from base-providers
export { getBaseProvider, getProviderIdFromAgentName, BASE_PROVIDERS };
