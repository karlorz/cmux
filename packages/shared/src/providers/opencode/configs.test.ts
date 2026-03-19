import { describe, expect, it } from "vitest";
import {
  OPENCODE_AGENT_CONFIGS,
  OPENCODE_FREE_MODEL_CONFIGS,
  OPENCODE_BASE_ARGS,
  createOpencodeFreeDynamicConfig,
} from "./configs";

describe("OPENCODE_BASE_ARGS", () => {
  it("contains --hostname", () => {
    expect(OPENCODE_BASE_ARGS).toContain("--hostname");
  });

  it("contains --port", () => {
    expect(OPENCODE_BASE_ARGS).toContain("--port");
  });
});

describe("OPENCODE_FREE_MODEL_CONFIGS", () => {
  it("is a non-empty array", () => {
    expect(OPENCODE_FREE_MODEL_CONFIGS).toBeInstanceOf(Array);
    expect(OPENCODE_FREE_MODEL_CONFIGS.length).toBeGreaterThan(0);
  });

  describe("config structure", () => {
    it("all configs have names starting with opencode/", () => {
      for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
        expect(config.name).toMatch(/^opencode\//);
      }
    });

    it("all configs use opencode command", () => {
      for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
        expect(config.command).toBe("opencode");
      }
    });

    it("all configs have empty apiKeys (free models)", () => {
      for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
        expect(config.apiKeys).toHaveLength(0);
      }
    });

    it("all configs have completionDetector function", () => {
      for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
        expect(config.completionDetector).toBeInstanceOf(Function);
      }
    });
  });
});

describe("OPENCODE_AGENT_CONFIGS", () => {
  it("is a non-empty array", () => {
    expect(OPENCODE_AGENT_CONFIGS).toBeInstanceOf(Array);
    expect(OPENCODE_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  it("includes free model configs", () => {
    for (const freeConfig of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(OPENCODE_AGENT_CONFIGS).toContain(freeConfig);
    }
  });

  it("includes paid models like grok-4-1-fast", () => {
    const config = OPENCODE_AGENT_CONFIGS.find(
      (c) => c.name === "opencode/grok-4-1-fast"
    );
    expect(config).toBeDefined();
  });

  it("includes anthropic models like sonnet-4", () => {
    const config = OPENCODE_AGENT_CONFIGS.find(
      (c) => c.name === "opencode/sonnet-4"
    );
    expect(config).toBeDefined();
  });

  it("includes openai models like gpt-5", () => {
    const config = OPENCODE_AGENT_CONFIGS.find(
      (c) => c.name === "opencode/gpt-5"
    );
    expect(config).toBeDefined();
  });

  it("includes openrouter models like kimi-k2", () => {
    const config = OPENCODE_AGENT_CONFIGS.find(
      (c) => c.name === "opencode/kimi-k2"
    );
    expect(config).toBeDefined();
  });

  describe("paid model configs", () => {
    it("paid models have non-empty apiKeys", () => {
      const paidConfigs = OPENCODE_AGENT_CONFIGS.filter(
        (c) => !OPENCODE_FREE_MODEL_CONFIGS.includes(c)
      );
      for (const config of paidConfigs) {
        expect(config.apiKeys?.length).toBeGreaterThan(0);
      }
    });
  });
});

describe("createOpencodeFreeDynamicConfig", () => {
  it("returns null for non-opencode models", () => {
    expect(createOpencodeFreeDynamicConfig("claude/opus")).toBeNull();
    expect(createOpencodeFreeDynamicConfig("gpt-5")).toBeNull();
  });

  it("returns null for paid opencode models", () => {
    expect(createOpencodeFreeDynamicConfig("opencode/gpt-5")).toBeNull();
  });

  it("returns config for models with -free suffix", () => {
    const config = createOpencodeFreeDynamicConfig(
      "opencode/test-model-free"
    );
    expect(config).not.toBeNull();
    expect(config?.name).toBe("opencode/test-model-free");
  });

  it("returned config uses opencode command", () => {
    const config = createOpencodeFreeDynamicConfig(
      "opencode/test-model-free"
    );
    expect(config?.command).toBe("opencode");
  });

  it("returned config has empty apiKeys", () => {
    const config = createOpencodeFreeDynamicConfig(
      "opencode/test-model-free"
    );
    expect(config?.apiKeys).toHaveLength(0);
  });

  it("returned config includes base args", () => {
    const config = createOpencodeFreeDynamicConfig(
      "opencode/test-model-free"
    );
    expect(config?.args).toContain("--hostname");
    expect(config?.args).toContain("--port");
  });

  it("returned config has completionDetector function", () => {
    const config = createOpencodeFreeDynamicConfig(
      "opencode/test-model-free"
    );
    expect(config?.completionDetector).toBeInstanceOf(Function);
  });
});
