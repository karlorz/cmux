import { describe, expect, it } from "vitest";
import {
  toBedrockModelId,
  base64Decode,
  MODEL_MAP,
  BEDROCK_AWS_REGION,
  BEDROCK_BASE_URL,
  BEDROCK_INFERENCE_PROFILE,
} from "./bedrock_utils";

describe("toBedrockModelId", () => {
  describe("Claude 4.6 models", () => {
    it("maps claude-opus-4-6 to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-opus-4-6");
      expect(result).toContain("anthropic.claude-opus-4-6");
      expect(result).toMatch(/^(us|global)\./);
    });

    it("maps claude-sonnet-4-6 to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-sonnet-4-6");
      expect(result).toContain("anthropic.claude-sonnet-4-6");
    });
  });

  describe("Claude 4.5 models", () => {
    it("maps claude-opus-4-5 to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-opus-4-5");
      expect(result).toContain("anthropic.claude-opus-4-5");
    });

    it("maps claude-haiku-4-5 to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-haiku-4-5");
      expect(result).toContain("anthropic.claude-haiku-4-5");
    });

    it("maps versioned model ID", () => {
      const result = toBedrockModelId("claude-opus-4-5-20251101");
      expect(result).toContain("anthropic.claude-opus-4-5");
    });
  });

  describe("Claude 3.5 models", () => {
    it("maps claude-3-5-sonnet to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-3-5-sonnet");
      expect(result).toContain("anthropic.claude-3-5-sonnet");
    });

    it("maps claude-3-5-haiku to Bedrock model ID", () => {
      const result = toBedrockModelId("claude-3-5-haiku");
      expect(result).toContain("anthropic.claude-3-5-haiku");
    });
  });

  describe("passthrough behavior", () => {
    it("passes through Bedrock-style model IDs", () => {
      const bedrockId = "us.anthropic.claude-opus-4-5-20251101-v1:0";
      expect(toBedrockModelId(bedrockId)).toBe(bedrockId);
    });

    it("passes through model IDs starting with anthropic.", () => {
      const modelId = "anthropic.claude-3-haiku";
      expect(toBedrockModelId(modelId)).toBe(modelId);
    });

    it("passes through unknown model IDs with warning", () => {
      const unknownModel = "unknown-model-xyz";
      expect(toBedrockModelId(unknownModel)).toBe(unknownModel);
    });
  });
});

describe("base64Decode", () => {
  it("decodes simple ASCII strings", () => {
    // "Hello" in base64
    expect(base64Decode("SGVsbG8=")).toBe("Hello");
  });

  it("decodes strings without padding", () => {
    // "Hi" in base64 (no padding needed)
    expect(base64Decode("SGk")).toBe("Hi");
  });

  it("decodes strings with single padding", () => {
    // "Hel" in base64 (single = padding)
    expect(base64Decode("SGVs")).toBe("Hel");
  });

  it("decodes strings with double padding", () => {
    // "He" in base64 (double == padding)
    expect(base64Decode("SGU=")).toBe("He");
  });

  it("decodes longer strings", () => {
    // "Hello, World!" in base64
    expect(base64Decode("SGVsbG8sIFdvcmxkIQ==")).toBe("Hello, World!");
  });

  it("decodes empty string", () => {
    expect(base64Decode("")).toBe("");
  });

  it("handles JSON content", () => {
    // {"key":"value"} in base64
    const encoded = btoa('{"key":"value"}');
    expect(base64Decode(encoded)).toBe('{"key":"value"}');
  });
});

describe("exported constants", () => {
  it("BEDROCK_AWS_REGION is a valid AWS region", () => {
    expect(BEDROCK_AWS_REGION).toMatch(/^[a-z]{2}-[a-z]+-\d$/);
  });

  it("BEDROCK_BASE_URL is a valid HTTPS URL", () => {
    expect(BEDROCK_BASE_URL).toMatch(/^https:\/\/bedrock-runtime\./);
    expect(BEDROCK_BASE_URL).toContain(BEDROCK_AWS_REGION);
  });

  it("BEDROCK_INFERENCE_PROFILE is us or global", () => {
    expect(["us", "global"]).toContain(BEDROCK_INFERENCE_PROFILE);
  });

  it("MODEL_MAP has expected models", () => {
    expect(MODEL_MAP["claude-opus-4-6"]).toBeDefined();
    expect(MODEL_MAP["claude-sonnet-4-6"]).toBeDefined();
    expect(MODEL_MAP["claude-opus-4-5"]).toBeDefined();
    expect(MODEL_MAP["claude-3-5-sonnet"]).toBeDefined();
  });

  it("MODEL_MAP values have correct prefix", () => {
    for (const [, bedrockId] of Object.entries(MODEL_MAP)) {
      expect(bedrockId).toMatch(/^(us|global)\./);
      expect(bedrockId).toContain("anthropic.");
    }
  });
});
