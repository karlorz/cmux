import { describe, expect, it } from "vitest";
import {
  normalizeOpenAiBaseUrl,
  normalizeGeminiBaseUrl,
  normalizeProviderBaseUrlForRawFetch,
  PROVIDER_URL_NORMALIZERS,
} from "./provider-url";

describe("normalizeOpenAiBaseUrl", () => {
  describe("URLs without /v1 suffix", () => {
    it("appends /v1 for AI SDK", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com");
      expect(result.forAiSdk).toBe("https://api.openai.com/v1");
    });

    it("keeps base URL for raw fetch", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com");
      expect(result.forRawFetch).toBe("https://api.openai.com");
    });
  });

  describe("URLs with /v1 suffix", () => {
    it("keeps /v1 for AI SDK", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com/v1");
      expect(result.forAiSdk).toBe("https://api.openai.com/v1");
    });

    it("strips /v1 for raw fetch", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com/v1");
      expect(result.forRawFetch).toBe("https://api.openai.com");
    });
  });

  describe("trailing slash handling", () => {
    it("removes trailing slash before processing", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com/");
      expect(result.forAiSdk).toBe("https://api.openai.com/v1");
      expect(result.forRawFetch).toBe("https://api.openai.com");
    });

    it("removes multiple trailing slashes", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com///");
      expect(result.forRawFetch).toBe("https://api.openai.com");
    });

    it("handles /v1/ with trailing slash", () => {
      const result = normalizeOpenAiBaseUrl("https://api.openai.com/v1/");
      expect(result.forAiSdk).toBe("https://api.openai.com/v1");
      expect(result.forRawFetch).toBe("https://api.openai.com");
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing whitespace", () => {
      const result = normalizeOpenAiBaseUrl("  https://api.openai.com  ");
      expect(result.forAiSdk).toBe("https://api.openai.com/v1");
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = normalizeOpenAiBaseUrl("");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles whitespace-only string", () => {
      const result = normalizeOpenAiBaseUrl("   ");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles custom proxy URLs", () => {
      const result = normalizeOpenAiBaseUrl("https://my-proxy.example.com");
      expect(result.forAiSdk).toBe("https://my-proxy.example.com/v1");
      expect(result.forRawFetch).toBe("https://my-proxy.example.com");
    });

    it("handles custom proxy URLs with path", () => {
      const result = normalizeOpenAiBaseUrl("https://gateway.example.com/openai");
      expect(result.forAiSdk).toBe("https://gateway.example.com/openai/v1");
      expect(result.forRawFetch).toBe("https://gateway.example.com/openai");
    });

    it("handles Cloudflare AI Gateway URL pattern", () => {
      const gatewayUrl =
        "https://gateway.ai.cloudflare.com/v1/abc123/proxy/openai";
      const result = normalizeOpenAiBaseUrl(gatewayUrl);
      // Gateway URL already has /v1 in path but NOT at the end
      expect(result.forAiSdk).toBe(`${gatewayUrl}/v1`);
      expect(result.forRawFetch).toBe(gatewayUrl);
    });
  });
});

describe("normalizeGeminiBaseUrl", () => {
  describe("URLs without version suffix", () => {
    it("appends /v1beta for AI SDK", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com"
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
    });

    it("keeps base URL for raw fetch", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });
  });

  describe("URLs with /v1beta suffix", () => {
    it("keeps /v1beta for AI SDK", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/v1beta"
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
    });

    it("strips /v1beta for raw fetch", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/v1beta"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });
  });

  describe("URLs with wrong /v1 suffix (cross-version handling)", () => {
    it("replaces /v1 with /v1beta for AI SDK", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/v1"
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
    });

    it("strips /v1 for raw fetch", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/v1"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });
  });

  describe("trailing slash handling", () => {
    it("removes trailing slash before processing", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/"
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });

    it("removes multiple trailing slashes", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com///"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });

    it("handles /v1beta/ with trailing slash", () => {
      const result = normalizeGeminiBaseUrl(
        "https://generativelanguage.googleapis.com/v1beta/"
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
      expect(result.forRawFetch).toBe(
        "https://generativelanguage.googleapis.com"
      );
    });
  });

  describe("whitespace handling", () => {
    it("trims leading/trailing whitespace", () => {
      const result = normalizeGeminiBaseUrl(
        "  https://generativelanguage.googleapis.com  "
      );
      expect(result.forAiSdk).toBe(
        "https://generativelanguage.googleapis.com/v1beta"
      );
    });
  });

  describe("edge cases", () => {
    it("handles empty string", () => {
      const result = normalizeGeminiBaseUrl("");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles whitespace-only string", () => {
      const result = normalizeGeminiBaseUrl("   ");
      expect(result.forAiSdk).toBe("");
      expect(result.forRawFetch).toBe("");
    });

    it("handles custom proxy URLs", () => {
      const result = normalizeGeminiBaseUrl("https://my-proxy.example.com");
      expect(result.forAiSdk).toBe("https://my-proxy.example.com/v1beta");
      expect(result.forRawFetch).toBe("https://my-proxy.example.com");
    });

    it("handles custom proxy URLs with path", () => {
      const result = normalizeGeminiBaseUrl(
        "https://gateway.example.com/gemini"
      );
      expect(result.forAiSdk).toBe("https://gateway.example.com/gemini/v1beta");
      expect(result.forRawFetch).toBe("https://gateway.example.com/gemini");
    });
  });
});

describe("normalizeProviderBaseUrlForRawFetch", () => {
  it("normalizes anthropic URLs", () => {
    expect(
      normalizeProviderBaseUrlForRawFetch(
        "anthropic",
        "https://api.anthropic.com/v1"
      )
    ).toBe("https://api.anthropic.com");
  });

  it("normalizes openai URLs", () => {
    expect(
      normalizeProviderBaseUrlForRawFetch(
        "openai",
        "https://api.openai.com/v1"
      )
    ).toBe("https://api.openai.com");
  });

  it("normalizes gemini URLs", () => {
    expect(
      normalizeProviderBaseUrlForRawFetch(
        "gemini",
        "https://generativelanguage.googleapis.com/v1beta"
      )
    ).toBe("https://generativelanguage.googleapis.com");
  });

  it("normalizes google URLs (alias for gemini)", () => {
    expect(
      normalizeProviderBaseUrlForRawFetch(
        "google",
        "https://generativelanguage.googleapis.com/v1beta"
      )
    ).toBe("https://generativelanguage.googleapis.com");
  });

  it("handles unknown providers by cleaning trailing slashes", () => {
    expect(
      normalizeProviderBaseUrlForRawFetch(
        "unknown",
        "https://example.com/api/"
      )
    ).toBe("https://example.com/api");
  });
});

describe("PROVIDER_URL_NORMALIZERS", () => {
  it("has normalizers for all expected providers", () => {
    expect(PROVIDER_URL_NORMALIZERS).toHaveProperty("anthropic");
    expect(PROVIDER_URL_NORMALIZERS).toHaveProperty("openai");
    expect(PROVIDER_URL_NORMALIZERS).toHaveProperty("gemini");
    expect(PROVIDER_URL_NORMALIZERS).toHaveProperty("google");
  });

  it("google is an alias for gemini", () => {
    expect(PROVIDER_URL_NORMALIZERS.google).toBe(
      PROVIDER_URL_NORMALIZERS.gemini
    );
  });
});
