import { describe, expect, it } from "vitest";
import { CLOUDFLARE_ANTHROPIC_BASE_URL } from "./anthropic";
import { CLOUDFLARE_GEMINI_BASE_URL } from "./gemini";
import { CLOUDFLARE_OPENAI_BASE_URL } from "./openai";
import {
  getDefaultPlatformAiBaseUrl,
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
      "claude-sonnet-4-5-20250929"
    );
    expect(getPlatformAiModelIdForService("review", "openai")).toBe(
      "gpt-5-nano"
    );
    expect(getPlatformAiModelIdForService("review", "gemini")).toBe(
      "gemini-2.5-flash"
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

  it("leaves non-anthropic base urls unchanged", () => {
    expect(
      normalizePlatformAiBaseUrl("openai", CLOUDFLARE_OPENAI_BASE_URL)
    ).toBe(CLOUDFLARE_OPENAI_BASE_URL);
    expect(
      normalizePlatformAiBaseUrl("gemini", CLOUDFLARE_GEMINI_BASE_URL)
    ).toBe(CLOUDFLARE_GEMINI_BASE_URL);
  });
});
