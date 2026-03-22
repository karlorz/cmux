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

type ResolvedServerPlatformAiModel = {
  model: LanguageModel;
  modelId: string;
  provider: PlatformAiProvider;
  providerName: string;
};

type ServerPlatformAiProviderRuntime = {
  createModel: (apiKey: string, modelId: string, rawBaseUrl: string) => LanguageModel;
  getApiKey: () => string | undefined;
  getRawBaseUrl: () => string;
};

const SERVER_PLATFORM_AI_PROVIDER_RUNTIME: Record<
  PlatformAiProvider,
  ServerPlatformAiProviderRuntime
> = {
  anthropic: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createAnthropic({
        apiKey,
        baseURL: normalizePlatformAiBaseUrl("anthropic", rawBaseUrl),
      })(modelId),
    getApiKey: () => process.env.ANTHROPIC_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_ANTHROPIC_BASE_URL ||
      getDefaultPlatformAiBaseUrl("anthropic"),
  },
  openai: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createOpenAI({
        apiKey,
        baseURL: normalizePlatformAiBaseUrl("openai", rawBaseUrl),
      })(modelId),
    getApiKey: () => process.env.OPENAI_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_OPENAI_BASE_URL ||
      getDefaultPlatformAiBaseUrl("openai"),
  },
  gemini: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createGoogleGenerativeAI({
        apiKey,
        baseURL: normalizePlatformAiBaseUrl("gemini", rawBaseUrl),
      })(modelId),
    getApiKey: () => process.env.GEMINI_API_KEY,
    getRawBaseUrl: () =>
      process.env.AIGATEWAY_GEMINI_BASE_URL ||
      getDefaultPlatformAiBaseUrl("gemini"),
  },
};

function getServerPlatformAiApiKey(provider: PlatformAiProvider): string | undefined {
  return SERVER_PLATFORM_AI_PROVIDER_RUNTIME[provider].getApiKey();
}

function getServerPlatformAiRawBaseUrl(provider: PlatformAiProvider): string {
  return SERVER_PLATFORM_AI_PROVIDER_RUNTIME[provider].getRawBaseUrl();
}

function createServerPlatformAiModel(options: {
  provider: PlatformAiProvider;
  modelId: string;
}): ResolvedServerPlatformAiModel | null {
  const { provider, modelId } = options;
  const apiKey = getServerPlatformAiApiKey(provider);
  if (!apiKey) {
    return null;
  }

  const rawBaseUrl = getServerPlatformAiRawBaseUrl(provider);
  return {
    model: SERVER_PLATFORM_AI_PROVIDER_RUNTIME[provider].createModel(
      apiKey,
      modelId,
      rawBaseUrl
    ),
    modelId,
    provider,
    providerName: getPlatformAiProviderName(provider),
  };
}

export function resolveServerPlatformAiModel(
  service: PlatformAiService,
  supportedProviders?: readonly PlatformAiProvider[]
): ResolvedServerPlatformAiModel | null {
  const providerOrder = getPlatformAiProviderOrder(supportedProviders);
  for (const provider of providerOrder) {
    const resolved = createServerPlatformAiModel({
      provider,
      modelId: getPlatformAiModelIdForService(service, provider),
    });
    if (resolved) {
      return resolved;
    }
  }
  return null;
}
