#!/usr/bin/env bun
/**
 * Test script for platform AI gateway endpoints.
 * Usage: bun run --env-file .env scripts/test-ai-gateway.ts [provider]
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

async function testModel(
  provider: PlatformAiProvider,
  tier: PlatformAiTier
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
  };

  const providerConfig = createProvider(provider, modelId);
  if (!providerConfig) {
    result.error = `No valid API key for ${provider} (${PROVIDER_ENV_CONFIG[provider].apiKeyEnv})`;
    result.latencyMs = Date.now() - start;
    return result;
  }

  try {
    const { text } = await generateText({
      model: providerConfig.model,
      prompt: "Reply with exactly five words.",
      maxOutputTokens: 50,
    });

    result.success = true;
    result.response = text.trim();
    result.latencyMs = Date.now() - start;
  } catch (error) {
    result.error =
      error instanceof Error ? error.message : "Unknown error";
    result.latencyMs = Date.now() - start;
  }

  return result;
}

async function testProvider(provider: PlatformAiProvider): Promise<TestResult[]> {
  const envConfig = PROVIDER_ENV_CONFIG[provider];
  const results: TestResult[] = [];

  console.log(`\n--- Testing ${getPlatformAiProviderName(provider)} ---`);
  console.log(`API Key: ${envConfig.apiKeyEnv}`);
  console.log(`Base URL Env: ${envConfig.baseUrlEnv}`);
  console.log(`Using Base URL: ${getProviderResolvedBaseUrl(provider)}`);

  for (const tier of PLATFORM_AI_TIERS) {
    const modelId = PLATFORM_AI_MODELS[provider][tier];
    process.stdout.write(`  Testing ${tier} (${modelId})... `);
    const result = await testModel(provider, tier);
    results.push(result);

    if (result.success) {
      console.log(`OK (${result.latencyMs}ms) - "${result.response}"`);
    } else {
      console.log(`FAILED (${result.latencyMs}ms) - ${result.error}`);
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
  const args = process.argv.slice(2);
  const specificProvider = args[0]?.toLowerCase();

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

  const allResults: TestResult[] = [];

  if (specificProvider) {
    if (!isPlatformAiProvider(specificProvider)) {
      console.error(`\nUnknown provider: ${specificProvider}`);
      console.error(
        `Available providers: ${getPlatformAiProviderOrder().join(", ")}`
      );
      process.exit(1);
    }

    const results = await testProvider(specificProvider);
    allResults.push(...results);
  } else {
    for (const provider of getPlatformAiProviderOrder()) {
      const results = await testProvider(provider);
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

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
