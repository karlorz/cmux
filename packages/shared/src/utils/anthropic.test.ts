import { describe, expect, it } from "vitest";
import {
  normalizeAnthropicBaseUrl,
  CLOUDFLARE_ANTHROPIC_BASE_URL,
  CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY,
  ANTHROPIC_MODEL_OPUS_47,
  ANTHROPIC_MODEL_OPUS_46,
  ANTHROPIC_MODEL_OPUS_45,
  ANTHROPIC_MODEL_HAIKU_45,
  BEDROCK_AWS_REGION,
} from "./anthropic";

describe("normalizeAnthropicBaseUrl", () => {
  describe("URLs without /v1 suffix", () => {
    it("appends /v1 for AI SDK", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com");
      expect(result.forAiSdk).toBe("https://api.anthropic.com/v1");
    });

    it("keeps base URL for raw fetch", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com");
      expect(result.forRawFetch).toBe("https://api.anthropic.com");
    });
  });

  describe("URLs with /v1 suffix", () => {
    it("keeps /v1 for AI SDK", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com/v1");
      expect(result.forAiSdk).toBe("https://api.anthropic.com/v1");
    });

    it("strips /v1 for raw fetch", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com/v1");
      expect(result.forRawFetch).toBe("https://api.anthropic.com");
    });
  });

  describe("trailing slash handling", () => {
    it("removes trailing slash before processing", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com/");
      expect(result.forAiSdk).toBe("https://api.anthropic.com/v1");
      expect(result.forRawFetch).toBe("https://api.anthropic.com");
    });

    it("removes multiple trailing slashes", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com///");
      expect(result.forRawFetch).toBe("https://api.anthropic.com");
    });

    it("handles /v1/ with trailing slash", () => {
      const result = normalizeAnthropicBaseUrl("https://api.anthropic.com/v1/");
      expect(result.forAiSdk).toBe("https://api.anthropic.com/v1");
      expect(result.forRawFetch).toBe("https://api.anthropic.com");
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing whitespace", () => {
      const result = normalizeAnthropicBaseUrl("  https://api.anthropic.com  ");
      expect(result.forAiSdk).toBe("https://api.anthropic.com/v1");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = normalizeAnthropicBaseUrl("");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles whitespace-only string", () => {
      const result = normalizeAnthropicBaseUrl("   ");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles custom proxy URLs", () => {
      const result = normalizeAnthropicBaseUrl("https://my-proxy.example.com");
      expect(result.forAiSdk).toBe("https://my-proxy.example.com/v1");
      expect(result.forRawFetch).toBe("https://my-proxy.example.com");
    });

    it("handles Cloudflare AI Gateway URL", () => {
      const result = normalizeAnthropicBaseUrl(CLOUDFLARE_ANTHROPIC_BASE_URL);
      expect(result.forAiSdk).toBe(`${CLOUDFLARE_ANTHROPIC_BASE_URL}/v1`);
      expect(result.forRawFetch).toBe(CLOUDFLARE_ANTHROPIC_BASE_URL);
    });
  });
});

describe("exported constants", () => {
  it("CLOUDFLARE_ANTHROPIC_BASE_URL is a valid URL", () => {
    expect(() => new URL(CLOUDFLARE_ANTHROPIC_BASE_URL)).not.toThrow();
  });

  it("CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY is a non-empty string", () => {
    expect(typeof CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY).toBe("string");
    expect(CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY.length).toBeGreaterThan(0);
  });

  it("ANTHROPIC_MODEL_OPUS_46 contains claude", () => {
    expect(ANTHROPIC_MODEL_OPUS_46).toContain("claude");
    expect(ANTHROPIC_MODEL_OPUS_46).toContain("opus");
  });

  it("ANTHROPIC_MODEL_OPUS_47 contains claude", () => {
    expect(ANTHROPIC_MODEL_OPUS_47).toContain("claude");
    expect(ANTHROPIC_MODEL_OPUS_47).toContain("opus");
  });

  it("ANTHROPIC_MODEL_OPUS_45 contains claude", () => {
    expect(ANTHROPIC_MODEL_OPUS_45).toContain("claude");
    expect(ANTHROPIC_MODEL_OPUS_45).toContain("opus");
  });

  it("ANTHROPIC_MODEL_HAIKU_45 contains claude", () => {
    expect(ANTHROPIC_MODEL_HAIKU_45).toContain("claude");
    expect(ANTHROPIC_MODEL_HAIKU_45).toContain("haiku");
  });

  it("BEDROCK_AWS_REGION is a valid AWS region", () => {
    expect(BEDROCK_AWS_REGION).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
  });
});
