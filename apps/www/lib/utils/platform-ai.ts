import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  getDefaultPlatformAiBaseUrl,
  getPlatformAiModelIdForService,
  getPlatformAiProviderName,
  getPlatformAiProviderOrder,
  normalizePlatformAiBaseUrl,
  type PlatformAiProvider,
  type PlatformAiService,
} from "@cmux/shared";
import type { LanguageModel } from "ai";
import { env } from "./www-env";

export type WwwPlatformAiModelConfig = {
  provider: PlatformAiProvider;
  model: string;
};

export type ResolvedWwwPlatformAiModel = {
  model: LanguageModel;
  modelId: string;
  provider: PlatformAiProvider;
  providerName: string;
  rawBaseUrl: string;
};

type WwwPlatformAiProviderRuntime = {
  createModel: (apiKey: string, modelId: string, rawBaseUrl: string) => LanguageModel;
  getApiKey: () => string | undefined;
  getRawBaseUrl: () => string;
  missingApiKeyMessage: string;
};

const WWW_PLATFORM_AI_PROVIDER_RUNTIME: Record<
  PlatformAiProvider,
  WwwPlatformAiProviderRuntime
> = {
  anthropic: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createAnthropic({
        apiKey,
        baseURL: normalizePlatformAiBaseUrl("anthropic", rawBaseUrl),
      })(modelId),
    getApiKey: () => env.ANTHROPIC_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_ANTHROPIC_BASE_URL ||
      getDefaultPlatformAiBaseUrl("anthropic"),
    missingApiKeyMessage:
      "ANTHROPIC_API_KEY environment variable is required for Anthropic review models.",
  },
  openai: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createOpenAI({
        apiKey,
        baseURL: rawBaseUrl,
      })(modelId),
    getApiKey: () => env.OPENAI_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_OPENAI_BASE_URL ||
      getDefaultPlatformAiBaseUrl("openai"),
    missingApiKeyMessage:
      "OPENAI_API_KEY environment variable is required for OpenAI review models.",
  },
  gemini: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createGoogleGenerativeAI({
        apiKey,
        baseURL: rawBaseUrl,
      })(modelId),
    getApiKey: () => env.GEMINI_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_GEMINI_BASE_URL ||
      getDefaultPlatformAiBaseUrl("gemini"),
    missingApiKeyMessage:
      "GEMINI_API_KEY environment variable is required for Gemini review models.",
  },
};

function getWwwPlatformAiApiKey(provider: PlatformAiProvider): string | undefined {
  return WWW_PLATFORM_AI_PROVIDER_RUNTIME[provider].getApiKey();
}

export function getWwwPlatformAiRawBaseUrl(provider: PlatformAiProvider): string {
  return WWW_PLATFORM_AI_PROVIDER_RUNTIME[provider].getRawBaseUrl();
}

export function getWwwPlatformAiMissingApiKeyMessage(
  provider: PlatformAiProvider
): string {
  return WWW_PLATFORM_AI_PROVIDER_RUNTIME[provider].missingApiKeyMessage;
}

export function createWwwPlatformAiModel(
  config: WwwPlatformAiModelConfig
): ResolvedWwwPlatformAiModel | null {
  const apiKey = getWwwPlatformAiApiKey(config.provider);
  if (!apiKey) {
    return null;
  }

  const rawBaseUrl = getWwwPlatformAiRawBaseUrl(config.provider);
  return {
    model: WWW_PLATFORM_AI_PROVIDER_RUNTIME[config.provider].createModel(
      apiKey,
      config.model,
      rawBaseUrl
    ),
    modelId: config.model,
    provider: config.provider,
    providerName: getPlatformAiProviderName(config.provider),
    rawBaseUrl,
  };
}

export function resolveWwwPlatformAiModel(
  service: PlatformAiService,
  supportedProviders?: readonly PlatformAiProvider[]
): ResolvedWwwPlatformAiModel | null {
  const providerOrder = getPlatformAiProviderOrder(supportedProviders);
  for (const provider of providerOrder) {
    const resolved = createWwwPlatformAiModel({
      provider,
      model: getPlatformAiModelIdForService(service, provider),
    });
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
