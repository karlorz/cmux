import { describe, expect, it } from "vitest";
import {
  OPENCODE_AGENT_CONFIGS,
  OPENCODE_FREE_MODEL_CONFIGS,
  OPENCODE_BASE_ARGS,
  createOpencodeFreeDynamicConfig,
} from "./configs";
import { OPENCODE_FREE_MODEL_IDS } from "./free-models";

describe("OPENCODE_BASE_ARGS", () => {
  it("includes --hostname flag", () => {
    expect(OPENCODE_BASE_ARGS).toContain("--hostname");
  });

  it("includes --port flag", () => {
    expect(OPENCODE_BASE_ARGS).toContain("--port");
  });

  it("has hostname value after --hostname", () => {
    const hostnameIndex = OPENCODE_BASE_ARGS.indexOf("--hostname");
    expect(OPENCODE_BASE_ARGS[hostnameIndex + 1]).toBeDefined();
  });

  it("has port value after --port", () => {
    const portIndex = OPENCODE_BASE_ARGS.indexOf("--port");
    expect(OPENCODE_BASE_ARGS[portIndex + 1]).toBeDefined();
  });
});

describe("OPENCODE_FREE_MODEL_CONFIGS", () => {
  it("is an array", () => {
    expect(Array.isArray(OPENCODE_FREE_MODEL_CONFIGS)).toBe(true);
  });

  it("has one config per free model ID", () => {
    expect(OPENCODE_FREE_MODEL_CONFIGS.length).toBe(OPENCODE_FREE_MODEL_IDS.length);
  });

  it("all configs use opencode command", () => {
    for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(config.command).toBe("opencode");
    }
  });

  it("all configs have name starting with opencode/", () => {
    for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(config.name).toMatch(/^opencode\//);
    }
  });

  it("all configs have empty apiKeys array", () => {
    for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(config.apiKeys).toEqual([]);
    }
  });

  it("all configs include base args", () => {
    for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(config.args).toContain("--hostname");
      expect(config.args).toContain("--port");
    }
  });

  it("all configs have --model flag", () => {
    for (const config of OPENCODE_FREE_MODEL_CONFIGS) {
      expect(config.args).toContain("--model");
    }
  });
});

describe("OPENCODE_AGENT_CONFIGS", () => {
  it("is an array of agent configs", () => {
    expect(Array.isArray(OPENCODE_AGENT_CONFIGS)).toBe(true);
    expect(OPENCODE_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  it("all configs have required fields", () => {
    for (const config of OPENCODE_AGENT_CONFIGS) {
      expect(config).toHaveProperty("name");
      expect(config).toHaveProperty("command");
      expect(config).toHaveProperty("args");
      expect(config).toHaveProperty("environment");
      expect(config).toHaveProperty("checkRequirements");
      expect(config).toHaveProperty("apiKeys");
      expect(config).toHaveProperty("completionDetector");
    }
  });

  it("all configs use opencode command", () => {
    for (const config of OPENCODE_AGENT_CONFIGS) {
      expect(config.command).toBe("opencode");
    }
  });

  it("all configs have name starting with opencode/", () => {
    for (const config of OPENCODE_AGENT_CONFIGS) {
      expect(config.name).toMatch(/^opencode\//);
    }
  });

  it("includes free model configs", () => {
    for (const freeConfig of OPENCODE_FREE_MODEL_CONFIGS) {
      const found = OPENCODE_AGENT_CONFIGS.find((c) => c.name === freeConfig.name);
      expect(found).toBeDefined();
    }
  });

  describe("paid model configs", () => {
    it("includes grok models", () => {
      const grok = OPENCODE_AGENT_CONFIGS.find(
        (c) => c.name === "opencode/grok-4-1-fast"
      );
      expect(grok).toBeDefined();
    });

    it("includes anthropic models", () => {
      const opus = OPENCODE_AGENT_CONFIGS.find(
        (c) => c.name === "opencode/opus-4"
      );
      expect(opus).toBeDefined();
    });

    it("includes openai models", () => {
      const gpt5 = OPENCODE_AGENT_CONFIGS.find(
        (c) => c.name === "opencode/gpt-5"
      );
      expect(gpt5).toBeDefined();
    });

    it("includes openrouter models", () => {
      const kimi = OPENCODE_AGENT_CONFIGS.find(
        (c) => c.name === "opencode/kimi-k2"
      );
      expect(kimi).toBeDefined();
    });
  });

  describe("gpt-5-nano conditional inclusion", () => {
    it("does not duplicate gpt-5-nano if in free models", () => {
      const nanoConfigs = OPENCODE_AGENT_CONFIGS.filter(
        (c) => c.name === "opencode/gpt-5-nano"
      );
      // Should only appear once (either as free or paid, not both)
      expect(nanoConfigs.length).toBeLessThanOrEqual(1);
    });
  });
});

describe("createOpencodeFreeDynamicConfig", () => {
  describe("valid free models", () => {
    it("returns config for model with -free suffix", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/glm-5-free");
      expect(config).not.toBeNull();
      expect(config?.name).toBe("opencode/glm-5-free");
    });

    it("returns config for known free model without suffix", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/big-pickle");
      expect(config).not.toBeNull();
      expect(config?.name).toBe("opencode/big-pickle");
    });

    it("returned config has correct structure", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/test-free");
      expect(config).toHaveProperty("name");
      expect(config).toHaveProperty("command", "opencode");
      expect(config).toHaveProperty("args");
      expect(config).toHaveProperty("environment");
      expect(config).toHaveProperty("checkRequirements");
      expect(config).toHaveProperty("apiKeys", []);
      expect(config).toHaveProperty("completionDetector");
    });

    it("returned config includes base args", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/test-free");
      expect(config?.args).toContain("--hostname");
      expect(config?.args).toContain("--port");
      expect(config?.args).toContain("--model");
    });
  });

  describe("invalid models", () => {
    it("returns null for non-opencode prefix", () => {
      const config = createOpencodeFreeDynamicConfig("claude/opus-4.5");
      expect(config).toBeNull();
    });

    it("returns null for paid model (no -free suffix)", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/grok-4-1-fast");
      expect(config).toBeNull();
    });

    it("returns null for empty string", () => {
      const config = createOpencodeFreeDynamicConfig("");
      expect(config).toBeNull();
    });

    it("returns null for string without opencode/ prefix", () => {
      const config = createOpencodeFreeDynamicConfig("gpt-5-free");
      expect(config).toBeNull();
    });
  });

  describe("model ID extraction", () => {
    it("correctly extracts model ID from full name", () => {
      const config = createOpencodeFreeDynamicConfig("opencode/custom-model-free");
      const modelArg = config?.args[config.args.indexOf("--model") + 1];
      expect(modelArg).toBe("opencode/custom-model-free");
    });
  });
});
