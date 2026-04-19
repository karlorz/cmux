import { CLOUDFLARE_ANTHROPIC_BASE_URL, normalizeAnthropicBaseUrl } from "./anthropic";
import { CLOUDFLARE_GEMINI_BASE_URL } from "./gemini";
import { CLOUDFLARE_OPENAI_BASE_URL } from "./openai";
import { normalizeOpenAiBaseUrl, normalizeGeminiBaseUrl } from "./provider-url";
import { DEFAULT_CLAUDE_NATIVE_MODEL_ID } from "../providers/anthropic/models";

export const PLATFORM_AI_PROVIDERS = ["anthropic", "openai", "gemini"] as const;
export type PlatformAiProvider = (typeof PLATFORM_AI_PROVIDERS)[number];

export const PLATFORM_AI_TIERS = ["low", "mid", "high"] as const;
export type PlatformAiTier = (typeof PLATFORM_AI_TIERS)[number];

export const PLATFORM_AI_SERVICES = ["branch", "commit", "crown", "review"] as const;
export type PlatformAiService = (typeof PLATFORM_AI_SERVICES)[number];

export type PlatformAiModelInfo = {
  modelId: string;
  maxOutputTokens: number;
};

type PlatformAiTierMap = Record<PlatformAiTier, PlatformAiModelInfo>;
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
    low: { modelId: "claude-haiku-4-5-20251001", maxOutputTokens: 8000 },
    mid: { modelId: "claude-sonnet-4-6", maxOutputTokens: 16000 },
    high: { modelId: DEFAULT_CLAUDE_NATIVE_MODEL_ID, maxOutputTokens: 32000 },
  },
  openai: {
    low: { modelId: "gpt-5-nano", maxOutputTokens: 16000 },
    mid: { modelId: "gpt-5.4-mini", maxOutputTokens: 32000 },
    high: { modelId: "gpt-5.4", maxOutputTokens: 32000 },
  },
  gemini: {
    low: { modelId: "gemini-3.1-flash-lite-preview", maxOutputTokens: 8192 },
    mid: { modelId: "gemini-3-flash-preview", maxOutputTokens: 65536 },
    high: { modelId: "gemini-2.5-pro", maxOutputTokens: 8192 },
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
  return PLATFORM_AI_MODELS[provider][tier].modelId;
}

export function getPlatformAiMaxOutputTokens(
  provider: PlatformAiProvider,
  tier: PlatformAiTier
): number {
  return PLATFORM_AI_MODELS[provider][tier].maxOutputTokens;
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
  supportedProviders?: readonly PlatformAiProvider[]
): PlatformAiProvider[] {
  if (!supportedProviders || supportedProviders === PLATFORM_AI_PROVIDER_ORDER) {
    return [...PLATFORM_AI_PROVIDER_ORDER];
  }
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
  switch (provider) {
    case "anthropic":
      return normalizeAnthropicBaseUrl(baseUrl).forAiSdk;
    case "openai":
      return normalizeOpenAiBaseUrl(baseUrl).forAiSdk;
    case "gemini":
      return normalizeGeminiBaseUrl(baseUrl).forAiSdk;
  }
}
