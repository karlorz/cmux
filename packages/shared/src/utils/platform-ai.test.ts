import { describe, expect, it } from "vitest";
import { CLOUDFLARE_ANTHROPIC_BASE_URL } from "./anthropic";
import { CLOUDFLARE_GEMINI_BASE_URL } from "./gemini";
import { CLOUDFLARE_OPENAI_BASE_URL } from "./openai";
import {
  getDefaultPlatformAiBaseUrl,
  getPlatformAiMaxOutputTokens,
  getPlatformAiModelIdForService,
  getPlatformAiProviderOrder,
  getPlatformAiTierForService,
  normalizePlatformAiBaseUrl,
  PLATFORM_AI_PROVIDER_ORDER,
} from "./platform-ai";

describe("platform-ai", () => {
  it("uses anthropic, openai, gemini provider order", () => {
    expect(PLATFORM_AI_PROVIDER_ORDER).toEqual([
      "anthropic",
      "openai",
      "gemini",
    ]);
  });

  it("keeps filtered provider order stable", () => {
    expect(getPlatformAiProviderOrder(["gemini", "anthropic"])).toEqual([
      "anthropic",
      "gemini",
    ]);
  });

  it("maps services to expected tiers", () => {
    expect(getPlatformAiTierForService("branch")).toBe("low");
    expect(getPlatformAiTierForService("commit")).toBe("low");
    expect(getPlatformAiTierForService("review")).toBe("low");
    expect(getPlatformAiTierForService("crown")).toBe("mid");
  });

  it("maps crown and review service models correctly", () => {
    expect(getPlatformAiModelIdForService("crown", "anthropic")).toBe(
      "claude-sonnet-4-6"
    );
    expect(getPlatformAiModelIdForService("review", "openai")).toBe(
      "gpt-5-nano"
    );
    expect(getPlatformAiModelIdForService("review", "gemini")).toBe(
      "gemini-3.1-flash-lite-preview"
    );
  });

  it("returns provider base url defaults", () => {
    expect(getDefaultPlatformAiBaseUrl("anthropic")).toBe(
      CLOUDFLARE_ANTHROPIC_BASE_URL
    );
    expect(getDefaultPlatformAiBaseUrl("openai")).toBe(
      CLOUDFLARE_OPENAI_BASE_URL
    );
    expect(getDefaultPlatformAiBaseUrl("gemini")).toBe(
      CLOUDFLARE_GEMINI_BASE_URL
    );
  });

  it("normalizes anthropic base urls for AI SDK usage", () => {
    expect(
      normalizePlatformAiBaseUrl("anthropic", CLOUDFLARE_ANTHROPIC_BASE_URL)
    ).toBe(`${CLOUDFLARE_ANTHROPIC_BASE_URL}/v1`);
  });

  it("normalizes openai base urls for AI SDK usage", () => {
    // OpenAI URLs get /v1 appended for AI SDK
    expect(
      normalizePlatformAiBaseUrl("openai", CLOUDFLARE_OPENAI_BASE_URL)
    ).toBe(`${CLOUDFLARE_OPENAI_BASE_URL}/v1`);
    // URLs already ending in /v1 stay unchanged
    expect(
      normalizePlatformAiBaseUrl("openai", "https://api.openai.com/v1")
    ).toBe("https://api.openai.com/v1");
  });

  it("normalizes gemini base urls for AI SDK usage", () => {
    // Gemini default already has /v1beta, so stays unchanged
    expect(
      normalizePlatformAiBaseUrl("gemini", CLOUDFLARE_GEMINI_BASE_URL)
    ).toBe(CLOUDFLARE_GEMINI_BASE_URL);
    // Bare URL gets /v1beta appended
    expect(
      normalizePlatformAiBaseUrl("gemini", "https://generativelanguage.googleapis.com")
    ).toBe("https://generativelanguage.googleapis.com/v1beta");
  });

  it("returns maxOutputTokens for provider/tier", () => {
    expect(getPlatformAiMaxOutputTokens("anthropic", "low")).toBe(8000);
    expect(getPlatformAiMaxOutputTokens("anthropic", "mid")).toBe(16000);
    expect(getPlatformAiMaxOutputTokens("anthropic", "high")).toBe(32000);
    expect(getPlatformAiMaxOutputTokens("gemini", "mid")).toBe(65536);
    expect(getPlatformAiMaxOutputTokens("openai", "high")).toBe(32000);
  });
});
