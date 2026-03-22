#!/usr/bin/env bun
/**
 * Test script for platform AI gateway endpoints.
 * Usage:
 *   bun run --env-file .env scripts/test-ai-gateway.ts [provider]
 *   bun run --env-file .env scripts/test-ai-gateway.ts [provider] --max-output-tokens 1000
 *   bun run --env-file .env scripts/test-ai-gateway.ts [provider] --prompt "Say hello."
 *
 * Examples:
 *   bun run --env-file .env scripts/test-ai-gateway.ts
 *   bun run --env-file .env scripts/test-ai-gateway.ts anthropic
 *   bun run --env-file .env scripts/test-ai-gateway.ts openai
 *   bun run --env-file .env scripts/test-ai-gateway.ts gemini
 */

import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, type LanguageModel } from "ai";
import {
  getDefaultPlatformAiBaseUrl,
  getPlatformAiProviderName,
  getPlatformAiProviderOrder,
  getPlatformAiServiceProfile,
  normalizePlatformAiBaseUrl,
  PLATFORM_AI_MODELS,
  PLATFORM_AI_SERVICES,
  PLATFORM_AI_TIERS,
  type PlatformAiProvider,
  type PlatformAiTier,
} from "@cmux/shared";

const PROVIDER_ENV_CONFIG: Record<
  PlatformAiProvider,
  {
    apiKeyEnv: string;
    baseUrlEnv: string;
  }
> = {
  anthropic: {
    apiKeyEnv: "ANTHROPIC_API_KEY",
    baseUrlEnv: "AIGATEWAY_ANTHROPIC_BASE_URL",
  },
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    baseUrlEnv: "AIGATEWAY_OPENAI_BASE_URL",
  },
  gemini: {
    apiKeyEnv: "GEMINI_API_KEY",
    baseUrlEnv: "AIGATEWAY_GEMINI_BASE_URL",
  },
};

interface TestResult {
  provider: PlatformAiProvider;
  tier: PlatformAiTier;
  model: string;
  baseUrl: string;
  success: boolean;
  response?: string;
  error?: string;
  latencyMs: number;
  finishReason?: string;
  reasoningText?: string;
  upstreamModelId?: string;
  warnings: string[];
}

type TestProviderOptions = {
  anthropic:
    | Record<string, never>
    | {
        sendReasoning: false;
        thinking: {
          type: "disabled";
        };
      };
  openai:
    | Record<string, never>
    | {
        reasoningEffort: "none";
      };
  google:
    | Record<string, never>
    | {
        thinkingConfig: {
          includeThoughts: false;
          thinkingLevel: "minimal";
        };
      };
};

function getProviderOptions(provider: PlatformAiProvider): TestProviderOptions {
  switch (provider) {
    case "anthropic":
      return {
        anthropic: {
          sendReasoning: false,
          thinking: {
            type: "disabled",
          },
        },
        openai: {},
        google: {},
      };
    case "openai":
      return {
        anthropic: {},
        openai: {
          reasoningEffort: "none",
        },
        google: {},
      };
    case "gemini":
      return {
        anthropic: {},
        openai: {},
        google: {
          thinkingConfig: {
            includeThoughts: false,
            thinkingLevel: "minimal",
          },
        },
      };
  }
}

function isValidApiKey(key: string | undefined): boolean {
  if (!key) {
    return false;
  }
  if (key.includes("placeholder")) {
    return false;
  }
  if (key.startsWith("sk_place")) {
    return false;
  }
  return true;
}

function isPlatformAiProvider(value: string): value is PlatformAiProvider {
  return getPlatformAiProviderOrder().some((provider) => provider === value);
}

function getProviderApiKey(provider: PlatformAiProvider): string | undefined {
  return process.env[PROVIDER_ENV_CONFIG[provider].apiKeyEnv];
}

function getProviderRawBaseUrl(provider: PlatformAiProvider): string {
  const envConfig = PROVIDER_ENV_CONFIG[provider];
  return (
    process.env[envConfig.baseUrlEnv] || getDefaultPlatformAiBaseUrl(provider)
  );
}

function getProviderResolvedBaseUrl(provider: PlatformAiProvider): string {
  return normalizePlatformAiBaseUrl(provider, getProviderRawBaseUrl(provider));
}

function createProvider(
  provider: PlatformAiProvider,
  modelId: string
): { model: LanguageModel; baseUrl: string } | null {
  const apiKey = getProviderApiKey(provider);
  if (!isValidApiKey(apiKey)) {
    return null;
  }

  const baseUrl = getProviderResolvedBaseUrl(provider);
  switch (provider) {
    case "anthropic": {
      const anthropic = createAnthropic({ apiKey, baseURL: baseUrl });
      return { model: anthropic(modelId), baseUrl };
    }
    case "openai": {
      const openai = createOpenAI({ apiKey, baseURL: baseUrl });
      return { model: openai(modelId), baseUrl };
    }
    case "gemini": {
      const google = createGoogleGenerativeAI({ apiKey, baseURL: baseUrl });
      return { model: google(modelId), baseUrl };
    }
  }
}

type CliOptions = {
  specificProvider?: PlatformAiProvider;
  maxOutputTokens: number;
  prompt: string;
};

function parseCliOptions(args: string[]): CliOptions {
  let specificProvider: PlatformAiProvider | undefined;
  let maxOutputTokens = 50;
  let prompt = "Reply with exactly five words.";

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    if (!arg.startsWith("--")) {
      if (specificProvider) {
        throw new Error(`Unexpected extra argument: ${arg}`);
      }
      if (!isPlatformAiProvider(arg)) {
        throw new Error(
          `Unknown provider: ${arg}. Available providers: ${getPlatformAiProviderOrder().join(", ")}`
        );
      }
      specificProvider = arg;
      continue;
    }

    if (arg === "--max-output-tokens") {
      const rawValue = args[index + 1];
      if (!rawValue) {
        throw new Error("Missing value for --max-output-tokens");
      }
      const parsedValue = Number.parseInt(rawValue, 10);
      if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
        throw new Error(`Invalid --max-output-tokens value: ${rawValue}`);
      }
      maxOutputTokens = parsedValue;
      index += 1;
      continue;
    }

    if (arg === "--prompt") {
      const rawPrompt = args[index + 1];
      if (!rawPrompt) {
        throw new Error("Missing value for --prompt");
      }
      prompt = rawPrompt;
      index += 1;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return {
    specificProvider,
    maxOutputTokens,
    prompt,
  };
}

async function testModel(
  provider: PlatformAiProvider,
  tier: PlatformAiTier,
  options: CliOptions
): Promise<TestResult> {
  const start = Date.now();
  const modelId = PLATFORM_AI_MODELS[provider][tier];
  const result: TestResult = {
    provider,
    tier,
    model: modelId,
    baseUrl: getProviderResolvedBaseUrl(provider),
    success: false,
    latencyMs: 0,
    warnings: [],
  };

  const providerConfig = createProvider(provider, modelId);
  if (!providerConfig) {
    result.error = `No valid API key for ${provider} (${PROVIDER_ENV_CONFIG[provider].apiKeyEnv})`;
    result.latencyMs = Date.now() - start;
    return result;
  }

  try {
    const { text, reasoning, finishReason, response } = await generateText({
      model: providerConfig.model,
      prompt: options.prompt,
      maxOutputTokens: options.maxOutputTokens,
      providerOptions: getProviderOptions(provider),
    });

    result.finishReason = finishReason;
    result.upstreamModelId = response.modelId;
    result.reasoningText =
      reasoning
        .map((part) => ("text" in part && typeof part.text === "string" ? part.text : ""))
        .join(" ")
        .trim();
    result.response = text.trim();
    result.latencyMs = Date.now() - start;

    if (response.modelId !== modelId) {
      result.warnings.push(
        `Requested ${modelId}, but upstream returned ${response.modelId}`
      );
    }
    if (provider === "anthropic" && result.reasoningText) {
      result.warnings.push(
        "Received Anthropic reasoning content even though thinking was disabled in providerOptions"
      );
    }

    if (result.response.length > 0) {
      result.success = true;
      return result;
    }

    result.error =
      `No text returned (finishReason=${finishReason}, upstreamModel=${response.modelId}` +
      `${result.reasoningText ? ", received reasoning-only content" : ""})`;
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "Unknown error";
    result.latencyMs = Date.now() - start;
  }

  return result;
}

async function testProvider(
  provider: PlatformAiProvider,
  options: CliOptions
): Promise<TestResult[]> {
  const envConfig = PROVIDER_ENV_CONFIG[provider];
  const results: TestResult[] = [];

  console.log(`\n--- Testing ${getPlatformAiProviderName(provider)} ---`);
  console.log(`API Key: ${envConfig.apiKeyEnv}`);
  console.log(`Base URL Env: ${envConfig.baseUrlEnv}`);
  console.log(`Using Base URL: ${getProviderResolvedBaseUrl(provider)}`);

  for (const tier of PLATFORM_AI_TIERS) {
    const modelId = PLATFORM_AI_MODELS[provider][tier];
    process.stdout.write(`  Testing ${tier} (${modelId})... `);
    const result = await testModel(provider, tier, options);
    results.push(result);

    if (result.success) {
      console.log(`OK (${result.latencyMs}ms) - "${result.response}"`);
    } else {
      console.log(`FAILED (${result.latencyMs}ms) - ${result.error}`);
      if (result.reasoningText) {
        console.log(
          `    reasoning preview: ${JSON.stringify(result.reasoningText.slice(0, 160))}`
        );
      }
    }
    for (const warning of result.warnings) {
      console.log(`    warning: ${warning}`);
    }
  }

  return results;
}

function logPlatformServiceProfiles(): void {
  console.log("\nPlatform service tiers:");
  for (const service of PLATFORM_AI_SERVICES) {
    const profile = getPlatformAiServiceProfile(service);
    console.log(
      `  ${service}: tier=${profile.tier}, providers=${profile.providers.join(" -> ")}`
    );
  }
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));

  console.log("===========================================");
  console.log("Platform AI Gateway Test");
  console.log("===========================================");

  logPlatformServiceProfiles();

  console.log("\nEnvironment Variables:");
  for (const provider of getPlatformAiProviderOrder()) {
    const envConfig = PROVIDER_ENV_CONFIG[provider];
    const apiKey = getProviderApiKey(provider);
    const hasValidKey = isValidApiKey(apiKey);
    const configuredBaseUrl = process.env[envConfig.baseUrlEnv];
    console.log(
      `  ${provider}: API_KEY=${hasValidKey ? "SET" : "NOT SET"}, BASE_URL=${configuredBaseUrl || "(default)"}`
    );
  }
  console.log(`Prompt: ${JSON.stringify(options.prompt)}`);
  console.log(`maxOutputTokens: ${options.maxOutputTokens}`);

  const allResults: TestResult[] = [];

  if (options.specificProvider) {
    const results = await testProvider(options.specificProvider, options);
    allResults.push(...results);
  } else {
    for (const provider of getPlatformAiProviderOrder()) {
      const results = await testProvider(provider, options);
      allResults.push(...results);
    }
  }

  console.log("\n===========================================");
  console.log("Summary");
  console.log("===========================================");

  const successful = allResults.filter((result) => result.success);
  const failed = allResults.filter((result) => !result.success);

  console.log(`Total: ${allResults.length} tests`);
  console.log(`Passed: ${successful.length}`);
  console.log(`Failed: ${failed.length}`);

  if (failed.length > 0) {
    console.log("\nFailed tests:");
    for (const result of failed) {
      console.log(
        `  - ${result.provider}/${result.tier}/${result.model}: ${result.error}`
      );
    }
  }

  if (successful.length > 0) {
    console.log("\nWorking models:");
    for (const result of successful) {
      console.log(
        `  - ${result.provider}/${result.tier}/${result.model} (${result.latencyMs}ms)`
      );
    }
  }

  const warned = allResults.filter((result) => result.warnings.length > 0);
  if (warned.length > 0) {
    console.log("\nWarnings:");
    for (const result of warned) {
      for (const warning of result.warnings) {
        console.log(
          `  - ${result.provider}/${result.tier}/${result.model}: ${warning}`
        );
      }
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
