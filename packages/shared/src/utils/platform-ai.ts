import { CLOUDFLARE_ANTHROPIC_BASE_URL, normalizeAnthropicBaseUrl } from "./anthropic";
import { CLOUDFLARE_GEMINI_BASE_URL } from "./gemini";
import { CLOUDFLARE_OPENAI_BASE_URL } from "./openai";

export const PLATFORM_AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type PlatformAiProvider = (typeof PLATFORM_AI_PROVIDERS)[number];

export const PLATFORM_AI_TIERS = ["low", "mid", "high"] as const;
export type PlatformAiTier = (typeof PLATFORM_AI_TIERS)[number];

export const PLATFORM_AI_SERVICES = ["branch", "commit", "crown", "review"] as const;
export type PlatformAiService = (typeof PLATFORM_AI_SERVICES)[number];

type PlatformAiTierMap = Record<PlatformAiTier, string>;
export type PlatformAiServiceProfile = {
  tier: PlatformAiTier;
  providers: readonly PlatformAiProvider[];
};

export const PLATFORM_AI_PROVIDER_ORDER: readonly PlatformAiProvider[] =
  PLATFORM_AI_PROVIDERS;

export const PLATFORM_AI_PROVIDER_NAMES: Record<PlatformAiProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Gemini",
};

export const PLATFORM_AI_MODELS: Record<PlatformAiProvider, PlatformAiTierMap> = {
  anthropic: {
    low: "claude-haiku-4-5-20251001",
    mid: "claude-sonnet-4-5-20250929",
    high: "claude-opus-4-5-20251101",
  },
  openai: {
    low: "gpt-5-nano",
    mid: "gpt-5-mini-2025-08-07",
    high: "gpt-5",
  },
  gemini: {
    low: "gemini-2.5-flash",
    mid: "gemini-3-flash-preview",
    high: "gemini-2.5-pro",
  },
};

export const PLATFORM_AI_SERVICE_PROFILES: Record<
  PlatformAiService,
  PlatformAiServiceProfile
> = {
  branch: {
    tier: "low",
    providers: PLATFORM_AI_PROVIDER_ORDER,
  },
  commit: {
    tier: "low",
    providers: PLATFORM_AI_PROVIDER_ORDER,
  },
  crown: {
    tier: "mid",
    providers: PLATFORM_AI_PROVIDER_ORDER,
  },
  review: {
    tier: "low",
    providers: PLATFORM_AI_PROVIDER_ORDER,
  },
};

export function getPlatformAiProviderName(provider: PlatformAiProvider): string {
  return PLATFORM_AI_PROVIDER_NAMES[provider];
}

export function getPlatformAiModelId(
  provider: PlatformAiProvider,
  tier: PlatformAiTier
): string {
  return PLATFORM_AI_MODELS[provider][tier];
}

export function getPlatformAiServiceProfile(
  service: PlatformAiService
): PlatformAiServiceProfile {
  return PLATFORM_AI_SERVICE_PROFILES[service];
}

export function getPlatformAiTierForService(
  service: PlatformAiService
): PlatformAiTier {
  return getPlatformAiServiceProfile(service).tier;
}

export function getPlatformAiModelIdForService(
  service: PlatformAiService,
  provider: PlatformAiProvider
): string {
  return getPlatformAiModelId(provider, getPlatformAiTierForService(service));
}

export function getPlatformAiProviderOrder(
  supportedProviders: readonly PlatformAiProvider[] = PLATFORM_AI_PROVIDER_ORDER
): PlatformAiProvider[] {
  const supportedProviderSet = new Set(supportedProviders);
  return PLATFORM_AI_PROVIDER_ORDER.filter((provider) =>
    supportedProviderSet.has(provider)
  );
}

export function getDefaultPlatformAiBaseUrl(provider: PlatformAiProvider): string {
  switch (provider) {
    case "anthropic":
      return CLOUDFLARE_ANTHROPIC_BASE_URL;
    case "openai":
      return CLOUDFLARE_OPENAI_BASE_URL;
    case "gemini":
      return CLOUDFLARE_GEMINI_BASE_URL;
  }
}

export function normalizePlatformAiBaseUrl(
  provider: PlatformAiProvider,
  baseUrl: string
): string {
  if (provider === "anthropic") {
    return normalizeAnthropicBaseUrl(baseUrl).forAiSdk;
  }
  return baseUrl;
}
