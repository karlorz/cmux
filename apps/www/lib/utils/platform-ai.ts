import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
  CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
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

type ResolvedWwwPlatformAiProviderRuntime = {
  apiKey: string;
  rawBaseUrl: string;
  createModel: (apiKey: string, modelId: string, rawBaseUrl: string) => LanguageModel;
};

type WwwPlatformAiProviderRuntime = {
  createModel: (apiKey: string, modelId: string, rawBaseUrl: string) => LanguageModel;
  resolveRuntime: () => ResolvedWwwPlatformAiProviderRuntime | null;
  missingApiKeyMessage: string;
};

function getConvexHttpActionBaseUrl(): string | null {
  if (env.CONVEX_SITE_URL) {
    return env.CONVEX_SITE_URL.replace(/\/$/, "");
  }

  const url = env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    return null;
  }

  return url.replace(".convex.cloud", ".convex.site").replace(/\/$/, "");
}

function resolveAnthropicRuntime(): ResolvedWwwPlatformAiProviderRuntime | null {
  const directApiKey = env.ANTHROPIC_API_KEY;
  if (directApiKey) {
    return {
      apiKey: directApiKey,
      rawBaseUrl:
        process.env.AIGATEWAY_ANTHROPIC_BASE_URL ||
        getDefaultPlatformAiBaseUrl("anthropic"),
      createModel: (apiKey, modelId, rawBaseUrl) =>
        createAnthropic({
          apiKey,
          baseURL: normalizePlatformAiBaseUrl("anthropic", rawBaseUrl),
        })(modelId),
    };
  }

  if (!env.AWS_BEARER_TOKEN_BEDROCK) {
    return null;
  }

  const convexHttpActionBaseUrl = getConvexHttpActionBaseUrl();
  if (!convexHttpActionBaseUrl) {
    return null;
  }

  return {
    apiKey: CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
    rawBaseUrl: `${convexHttpActionBaseUrl}/api/anthropic`,
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createAnthropic({
        apiKey,
        baseURL: normalizePlatformAiBaseUrl("anthropic", rawBaseUrl),
      })(modelId),
  };
}

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
    resolveRuntime: resolveAnthropicRuntime,
    missingApiKeyMessage:
      "Anthropic review models require ANTHROPIC_API_KEY or AWS_BEARER_TOKEN_BEDROCK environment variables.",
  },
  openai: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createOpenAI({
        apiKey,
        baseURL: rawBaseUrl,
      })(modelId),
    resolveRuntime: () => {
      const apiKey = env.OPENAI_API_KEY;
      if (!apiKey) {
        return null;
      }

      return {
        apiKey,
        rawBaseUrl:
          process.env.AIGATEWAY_OPENAI_BASE_URL ||
          getDefaultPlatformAiBaseUrl("openai"),
        createModel: WWW_PLATFORM_AI_PROVIDER_RUNTIME.openai.createModel,
      };
    },
    missingApiKeyMessage:
      "OPENAI_API_KEY environment variable is required for OpenAI review models.",
  },
  gemini: {
    createModel: (apiKey, modelId, rawBaseUrl) =>
      createGoogleGenerativeAI({
        apiKey,
        baseURL: rawBaseUrl,
      })(modelId),
    resolveRuntime: () => {
      const apiKey = env.GEMINI_API_KEY;
      if (!apiKey) {
        return null;
      }

      return {
        apiKey,
        rawBaseUrl:
          process.env.AIGATEWAY_GEMINI_BASE_URL ||
          getDefaultPlatformAiBaseUrl("gemini"),
        createModel: WWW_PLATFORM_AI_PROVIDER_RUNTIME.gemini.createModel,
      };
    },
    missingApiKeyMessage:
      "GEMINI_API_KEY environment variable is required for Gemini review models.",
  },
};

function resolveWwwPlatformAiProviderRuntime(
  provider: PlatformAiProvider
): ResolvedWwwPlatformAiProviderRuntime | null {
  return WWW_PLATFORM_AI_PROVIDER_RUNTIME[provider].resolveRuntime();
}

export function getWwwPlatformAiRawBaseUrl(provider: PlatformAiProvider): string | null {
  return resolveWwwPlatformAiProviderRuntime(provider)?.rawBaseUrl ?? null;
}

export function getWwwPlatformAiMissingApiKeyMessage(
  provider: PlatformAiProvider
): string {
  return WWW_PLATFORM_AI_PROVIDER_RUNTIME[provider].missingApiKeyMessage;
}

export function createWwwPlatformAiModel(
  config: WwwPlatformAiModelConfig
): ResolvedWwwPlatformAiModel | null {
  const runtime = resolveWwwPlatformAiProviderRuntime(config.provider);
  if (!runtime) {
    return null;
  }

  return {
    model: runtime.createModel(runtime.apiKey, config.model, runtime.rawBaseUrl),
    modelId: config.model,
    provider: config.provider,
    providerName: getPlatformAiProviderName(config.provider),
    rawBaseUrl: runtime.rawBaseUrl,
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
