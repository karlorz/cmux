import { describe, expect, it } from "vitest";
import { GROK_AGENT_CONFIGS } from "./configs";
import { XAI_API_KEY } from "../../apiKeys";

describe("GROK_AGENT_CONFIGS", () => {
  it("is a non-empty array", () => {
    expect(GROK_AGENT_CONFIGS).toBeInstanceOf(Array);
    expect(GROK_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  describe("config structure", () => {
    it("all configs have names starting with grok/", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.name).toMatch(/^grok\//);
      }
    });

    it("all configs use grok command", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.command).toBe("grok");
      }
    });

    it("all configs have --model and --yolo args", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.args).toContain("--model");
        expect(config.args).toContain("--yolo");
      }
    });

    it("all configs have telemetry args", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.args).toContain("--telemetry");
        expect(config.args).toContain("--telemetry-target=local");
        expect(config.args).toContain("--telemetry-log-prompts");
      }
    });

    it("all configs have XAI_API_KEY mapped to OPENAI_API_KEY", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        const apiKey = config.apiKeys?.find(
          (k) =>
            typeof k === "object" &&
            "envVar" in k &&
            k.envVar === XAI_API_KEY.envVar
        );
        expect(apiKey).toBeDefined();
        expect(apiKey).toHaveProperty("mapToEnvVar", "OPENAI_API_KEY");
      }
    });

    it("all configs have environment function", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.environment).toBeInstanceOf(Function);
      }
    });

    it("all configs have checkRequirements function", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.checkRequirements).toBeInstanceOf(Function);
      }
    });

    it("all configs have completionDetector function", () => {
      for (const config of GROK_AGENT_CONFIGS) {
        expect(config.completionDetector).toBeInstanceOf(Function);
      }
    });
  });

  describe("model variations", () => {
    it("includes grok-code-fast-1 model", () => {
      const config = GROK_AGENT_CONFIGS.find(
        (c) => c.name === "grok/grok-code-fast-1"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("grok-code-fast-1");
    });

    it("includes grok-4-latest model", () => {
      const config = GROK_AGENT_CONFIGS.find(
        (c) => c.name === "grok/grok-4-latest"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("grok-4-latest");
    });

    it("includes grok-3-latest model", () => {
      const config = GROK_AGENT_CONFIGS.find(
        (c) => c.name === "grok/grok-3-latest"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("grok-3-latest");
    });

    it("includes grok-3-fast model", () => {
      const config = GROK_AGENT_CONFIGS.find(
        (c) => c.name === "grok/grok-3-fast"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("grok-3-fast");
    });
  });
});
