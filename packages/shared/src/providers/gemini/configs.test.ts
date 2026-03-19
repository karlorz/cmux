import { describe, expect, it } from "vitest";
import { GEMINI_AGENT_CONFIGS } from "./configs";
import { GEMINI_API_KEY } from "../../apiKeys";

describe("GEMINI_AGENT_CONFIGS", () => {
  it("is a non-empty array", () => {
    expect(GEMINI_AGENT_CONFIGS).toBeInstanceOf(Array);
    expect(GEMINI_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  describe("config structure", () => {
    it("all configs have names starting with gemini/", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.name).toMatch(/^gemini\//);
      }
    });

    it("all configs use gemini command", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.command).toBe("gemini");
      }
    });

    it("all configs have --model and --yolo args", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.args).toContain("--model");
        expect(config.args).toContain("--yolo");
      }
    });

    it("all configs have telemetry args", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.args).toContain("--telemetry");
        expect(config.args).toContain("--telemetry-target=local");
        expect(config.args).toContain("--telemetry-log-prompts");
      }
    });

    it("all configs have GEMINI_API_KEY in apiKeys", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.apiKeys).toContain(GEMINI_API_KEY);
      }
    });

    it("all configs have environment function", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.environment).toBeInstanceOf(Function);
      }
    });

    it("all configs have checkRequirements function", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.checkRequirements).toBeInstanceOf(Function);
      }
    });

    it("all configs have completionDetector function", () => {
      for (const config of GEMINI_AGENT_CONFIGS) {
        expect(config.completionDetector).toBeInstanceOf(Function);
      }
    });
  });

  describe("model variations", () => {
    it("includes 3.1-pro-preview model", () => {
      const config = GEMINI_AGENT_CONFIGS.find(
        (c) => c.name === "gemini/3.1-pro-preview"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("gemini-3.1-pro-preview");
    });

    it("includes 2.5-flash model", () => {
      const config = GEMINI_AGENT_CONFIGS.find(
        (c) => c.name === "gemini/2.5-flash"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("gemini-2.5-flash");
    });

    it("includes 2.5-pro model", () => {
      const config = GEMINI_AGENT_CONFIGS.find(
        (c) => c.name === "gemini/2.5-pro"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("gemini-2.5-pro");
    });
  });
});
