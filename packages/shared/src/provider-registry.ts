/**
 * Provider Registry for dynamic provider loading and per-team customization.
 *
 * Enables teams to customize base URLs, API formats, and fallback chains
 * for AI providers like Anthropic, OpenAI, and custom proxies.
 */

import type { AgentConfigApiKey } from "./agentConfig";
import {
  BASE_PROVIDERS,
  getBaseProvider,
  getProviderIdFromAgentName,
  type ApiFormat,
  type ProviderSpec,
} from "./providers/base-providers";

export { type ApiFormat, type ProviderSpec };

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
  isOverridden: boolean;
}

/**
 * Provider Registry for resolving providers with team customizations.
 */
export class ProviderRegistry {
  private baseProviders: Map<string, ProviderSpec>;

  constructor() {
    this.baseProviders = new Map(BASE_PROVIDERS.map((p) => [p.id, p]));
  }

  /**
   * Get all base provider IDs.
   */
  getProviderIds(): string[] {
    return Array.from(this.baseProviders.keys());
  }

  /**
   * Get a base provider spec by ID.
   */
  getBaseProvider(providerId: string): ProviderSpec | undefined {
    return this.baseProviders.get(providerId);
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
