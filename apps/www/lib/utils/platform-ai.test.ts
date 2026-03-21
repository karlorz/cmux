import {
  CLOUDFLARE_ANTHROPIC_BASE_URL,
  CLOUDFLARE_GEMINI_BASE_URL,
  CLOUDFLARE_OPENAI_BASE_URL,
  CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
  getPlatformAiModelIdForService,
} from "@cmux/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

type MockEnv = {
  NEXT_PUBLIC_CONVEX_URL: string;
  CONVEX_SITE_URL?: string;
  OPENAI_API_KEY?: string;
  GEMINI_API_KEY?: string;
  ANTHROPIC_API_KEY?: string;
  AWS_BEARER_TOKEN_BEDROCK?: string;
};

type ProviderCall = {
  apiKey: string;
  baseURL: string;
  modelId: string;
};

const anthropicCalls: ProviderCall[] = [];
const openAiCalls: ProviderCall[] = [];
const geminiCalls: ProviderCall[] = [];

const ORIGINAL_GATEWAY_ENV = {
  anthropic: process.env.AIGATEWAY_ANTHROPIC_BASE_URL,
  openai: process.env.AIGATEWAY_OPENAI_BASE_URL,
  gemini: process.env.AIGATEWAY_GEMINI_BASE_URL,
};

function restoreGatewayEnv(): void {
  if (ORIGINAL_GATEWAY_ENV.anthropic === undefined) {
    delete process.env.AIGATEWAY_ANTHROPIC_BASE_URL;
  } else {
    process.env.AIGATEWAY_ANTHROPIC_BASE_URL = ORIGINAL_GATEWAY_ENV.anthropic;
  }

  if (ORIGINAL_GATEWAY_ENV.openai === undefined) {
    delete process.env.AIGATEWAY_OPENAI_BASE_URL;
  } else {
    process.env.AIGATEWAY_OPENAI_BASE_URL = ORIGINAL_GATEWAY_ENV.openai;
  }

  if (ORIGINAL_GATEWAY_ENV.gemini === undefined) {
    delete process.env.AIGATEWAY_GEMINI_BASE_URL;
  } else {
    process.env.AIGATEWAY_GEMINI_BASE_URL = ORIGINAL_GATEWAY_ENV.gemini;
  }
}

async function loadPlatformAiModule(
  envOverrides: Partial<MockEnv> = {},
  gatewayOverrides: Partial<Record<"anthropic" | "openai" | "gemini", string>> = {}
) {
  vi.resetModules();
  anthropicCalls.length = 0;
  openAiCalls.length = 0;
  geminiCalls.length = 0;
  restoreGatewayEnv();

  if (gatewayOverrides.anthropic !== undefined) {
    process.env.AIGATEWAY_ANTHROPIC_BASE_URL = gatewayOverrides.anthropic;
  } else {
    delete process.env.AIGATEWAY_ANTHROPIC_BASE_URL;
  }

  if (gatewayOverrides.openai !== undefined) {
    process.env.AIGATEWAY_OPENAI_BASE_URL = gatewayOverrides.openai;
  } else {
    delete process.env.AIGATEWAY_OPENAI_BASE_URL;
  }

  if (gatewayOverrides.gemini !== undefined) {
    process.env.AIGATEWAY_GEMINI_BASE_URL = gatewayOverrides.gemini;
  } else {
    delete process.env.AIGATEWAY_GEMINI_BASE_URL;
  }

  vi.doMock("./www-env", () => ({
    env: {
      NEXT_PUBLIC_CONVEX_URL: "https://test.convex.cloud",
      CONVEX_SITE_URL: undefined,
      OPENAI_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      AWS_BEARER_TOKEN_BEDROCK: undefined,
      ...envOverrides,
    },
  }));

  vi.doMock("@ai-sdk/anthropic", () => ({
    createAnthropic: ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) =>
      (modelId: string) => {
        anthropicCalls.push({ apiKey, baseURL, modelId });
        return {
          provider: "anthropic",
          apiKey,
          baseURL,
          modelId,
        };
      },
  }));

  vi.doMock("@ai-sdk/openai", () => ({
    createOpenAI: ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) =>
      (modelId: string) => {
        openAiCalls.push({ apiKey, baseURL, modelId });
        return {
          provider: "openai",
          apiKey,
          baseURL,
          modelId,
        };
      },
  }));

  vi.doMock("@ai-sdk/google", () => ({
    createGoogleGenerativeAI: ({ apiKey, baseURL }: { apiKey: string; baseURL: string }) =>
      (modelId: string) => {
        geminiCalls.push({ apiKey, baseURL, modelId });
        return {
          provider: "gemini",
          apiKey,
          baseURL,
          modelId,
        };
      },
  }));

  return import("./platform-ai");
}

afterEach(() => {
  restoreGatewayEnv();
  vi.clearAllMocks();
  vi.resetModules();
});

describe("www platform-ai runtime", () => {
  it("resolves Anthropic models with a direct Anthropic API key", async () => {
    const { createWwwPlatformAiModel } = await loadPlatformAiModule({
      ANTHROPIC_API_KEY: "anthropic-direct-key",
    });
    const modelId = getPlatformAiModelIdForService("review", "anthropic");

    const resolved = createWwwPlatformAiModel({
      provider: "anthropic",
      model: modelId,
    });

    expect(resolved).toMatchObject({
      provider: "anthropic",
      providerName: "Anthropic",
      modelId,
      rawBaseUrl: CLOUDFLARE_ANTHROPIC_BASE_URL,
    });
    expect(anthropicCalls).toEqual([
      {
        apiKey: "anthropic-direct-key",
        baseURL: `${CLOUDFLARE_ANTHROPIC_BASE_URL}/v1`,
        modelId,
      },
    ]);
  });

  it("falls back to the Bedrock-backed Anthropic proxy when only Bedrock credentials are present", async () => {
    const { createWwwPlatformAiModel } = await loadPlatformAiModule({
      NEXT_PUBLIC_CONVEX_URL: "https://workspace-name.convex.cloud",
      AWS_BEARER_TOKEN_BEDROCK: "bedrock-token",
    });
    const modelId = getPlatformAiModelIdForService("review", "anthropic");

    const resolved = createWwwPlatformAiModel({
      provider: "anthropic",
      model: modelId,
    });

    expect(resolved).toMatchObject({
      provider: "anthropic",
      providerName: "Anthropic",
      modelId,
      rawBaseUrl: "https://workspace-name.convex.site/api/anthropic",
    });
    expect(anthropicCalls).toEqual([
      {
        apiKey: CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
        baseURL: "https://workspace-name.convex.site/api/anthropic/v1",
        modelId,
      },
    ]);
  });

  it("returns null for Anthropic when neither direct nor Bedrock credentials are available", async () => {
    const {
      createWwwPlatformAiModel,
      getWwwPlatformAiMissingApiKeyMessage,
      getWwwPlatformAiRawBaseUrl,
    } = await loadPlatformAiModule();
    const modelId = getPlatformAiModelIdForService("review", "anthropic");

    expect(
      createWwwPlatformAiModel({
        provider: "anthropic",
        model: modelId,
      })
    ).toBeNull();
    expect(getWwwPlatformAiRawBaseUrl("anthropic")).toBeNull();
    expect(getWwwPlatformAiMissingApiKeyMessage("anthropic")).toContain(
      "ANTHROPIC_API_KEY"
    );
    expect(getWwwPlatformAiMissingApiKeyMessage("anthropic")).toContain(
      "AWS_BEARER_TOKEN_BEDROCK"
    );
  });

  it("keeps OpenAI resolution unchanged", async () => {
    const { resolveWwwPlatformAiModel } = await loadPlatformAiModule({
      OPENAI_API_KEY: "openai-key",
    });
    const modelId = getPlatformAiModelIdForService("review", "openai");

    const resolved = resolveWwwPlatformAiModel("review", ["openai", "gemini"]);

    expect(resolved).toMatchObject({
      provider: "openai",
      providerName: "OpenAI",
      modelId,
      rawBaseUrl: CLOUDFLARE_OPENAI_BASE_URL,
    });
    expect(openAiCalls).toEqual([
      {
        apiKey: "openai-key",
        baseURL: CLOUDFLARE_OPENAI_BASE_URL,
        modelId,
      },
    ]);
  });

  it("keeps Gemini resolution unchanged", async () => {
    const { resolveWwwPlatformAiModel } = await loadPlatformAiModule({
      GEMINI_API_KEY: "gemini-key",
    });
    const modelId = getPlatformAiModelIdForService("review", "gemini");

    const resolved = resolveWwwPlatformAiModel("review", ["openai", "gemini"]);

    expect(resolved).toMatchObject({
      provider: "gemini",
      providerName: "Gemini",
      modelId,
      rawBaseUrl: CLOUDFLARE_GEMINI_BASE_URL,
    });
    expect(geminiCalls).toEqual([
      {
        apiKey: "gemini-key",
        baseURL: CLOUDFLARE_GEMINI_BASE_URL,
        modelId,
      },
    ]);
  });
});
