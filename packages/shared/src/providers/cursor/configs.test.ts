import { describe, expect, it } from "vitest";
import { CURSOR_AGENT_CONFIGS } from "./configs";
import { CURSOR_API_KEY, CURSOR_AUTH_JSON } from "../../apiKeys";

describe("CURSOR_AGENT_CONFIGS", () => {
  const interactiveConfigs = CURSOR_AGENT_CONFIGS.filter(
    (c) => !c.name.endsWith("-ci")
  );
  const ciConfigs = CURSOR_AGENT_CONFIGS.filter((c) => c.name.endsWith("-ci"));

  it("is a non-empty array", () => {
    expect(CURSOR_AGENT_CONFIGS).toBeInstanceOf(Array);
    expect(CURSOR_AGENT_CONFIGS.length).toBeGreaterThan(0);
  });

  it("has both interactive and CI configs", () => {
    expect(interactiveConfigs.length).toBe(4);
    expect(ciConfigs.length).toBe(4);
  });

  describe("config structure", () => {
    it("all configs have names starting with cursor/", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        expect(config.name).toMatch(/^cursor\//);
      }
    });

    it("all configs use agent command path", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        // Use "agent" (official name per Cursor docs) - "cursor-agent" is legacy symlink
        expect(config.command).toBe("/root/.local/bin/agent");
      }
    });

    it("all configs have --force and --model args", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        expect(config.args).toContain("--force");
        expect(config.args).toContain("--model");
      }
    });

    it("all configs have both CURSOR_AUTH_JSON and CURSOR_API_KEY in apiKeys", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        expect(config.apiKeys).toContain(CURSOR_AUTH_JSON);
        expect(config.apiKeys).toContain(CURSOR_API_KEY);
      }
    });

    it("all configs have environment function", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        expect(config.environment).toBeInstanceOf(Function);
      }
    });

    it("all configs have checkRequirements function", () => {
      for (const config of CURSOR_AGENT_CONFIGS) {
        expect(config.checkRequirements).toBeInstanceOf(Function);
      }
    });
  });

  describe("interactive configs", () => {
    it("have waitForString set to Ready", () => {
      for (const config of interactiveConfigs) {
        expect(config.waitForString).toBe("Ready");
      }
    });

    it("do not have completionDetector", () => {
      for (const config of interactiveConfigs) {
        expect(config.completionDetector).toBeUndefined();
      }
    });
  });

  describe("CI configs", () => {
    it("have --output-format json args", () => {
      for (const config of ciConfigs) {
        expect(config.args).toContain("--output-format");
        expect(config.args).toContain("json");
      }
    });

    it("have -p flag for prompt", () => {
      for (const config of ciConfigs) {
        expect(config.args).toContain("-p");
      }
    });

    it("have completionDetector function", () => {
      for (const config of ciConfigs) {
        expect(config.completionDetector).toBeInstanceOf(Function);
      }
    });

    it("do not have waitForString", () => {
      for (const config of ciConfigs) {
        expect(config.waitForString).toBeUndefined();
      }
    });
  });

  describe("model variations", () => {
    it("includes opus-4.1 model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/opus-4.1"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("opus-4.1");
    });

    it("includes gpt-5 model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/gpt-5"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("gpt-5");
    });

    it("includes sonnet-4 model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/sonnet-4"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("sonnet-4");
    });

    it("includes sonnet-4-thinking model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/sonnet-4-thinking"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("sonnet-4-thinking");
    });

    it("includes opus-4.1-ci model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/opus-4.1-ci"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("opus-4.1");
    });

    it("includes sonnet-4-thinking-ci model", () => {
      const config = CURSOR_AGENT_CONFIGS.find(
        (c) => c.name === "cursor/sonnet-4-thinking-ci"
      );
      expect(config).toBeDefined();
      expect(config?.args).toContain("sonnet-4-thinking");
    });
  });
});
