import { describe, expect, it } from "vitest";
import { MCP_SERVER_PRESETS, type McpServerPreset } from "./mcp-presets";

describe("MCP_SERVER_PRESETS", () => {
  describe("structure validation", () => {
    it("is a non-empty readonly array", () => {
      expect(Array.isArray(MCP_SERVER_PRESETS)).toBe(true);
      expect(MCP_SERVER_PRESETS.length).toBeGreaterThan(0);
    });

    it("all presets have required fields", () => {
      for (const preset of MCP_SERVER_PRESETS) {
        // Base McpStdioServerConfig fields
        expect(preset.name).toBeTruthy();
        expect(preset.type).toBe("stdio");
        expect(preset.command).toBeTruthy();
        expect(Array.isArray(preset.args)).toBe(true);

        // McpServerPreset extension fields
        expect(preset.displayName).toBeTruthy();
        expect(preset.description).toBeTruthy();
        expect(Array.isArray(preset.tags)).toBe(true);
        expect(preset.supportedAgents).toBeDefined();
      }
    });

    it("all presets have boolean supportedAgents fields", () => {
      for (const preset of MCP_SERVER_PRESETS) {
        expect(typeof preset.supportedAgents.claude).toBe("boolean");
        expect(typeof preset.supportedAgents.codex).toBe("boolean");
        expect(typeof preset.supportedAgents.gemini).toBe("boolean");
        expect(typeof preset.supportedAgents.opencode).toBe("boolean");
      }
    });
  });

  describe("preset names", () => {
    it("has unique names", () => {
      const names = MCP_SERVER_PRESETS.map((p) => p.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it("includes context7 preset", () => {
      const context7 = MCP_SERVER_PRESETS.find((p) => p.name === "context7");
      expect(context7).toBeDefined();
      expect(context7?.displayName).toBe("Context7");
    });

    it("includes github preset", () => {
      const github = MCP_SERVER_PRESETS.find((p) => p.name === "github");
      expect(github).toBeDefined();
      expect(github?.displayName).toBe("GitHub");
    });

    it("includes filesystem preset", () => {
      const filesystem = MCP_SERVER_PRESETS.find((p) => p.name === "filesystem");
      expect(filesystem).toBeDefined();
      expect(filesystem?.displayName).toBe("Filesystem");
    });
  });

  describe("context7 preset", () => {
    it("uses npx command", () => {
      const context7 = MCP_SERVER_PRESETS.find((p) => p.name === "context7");
      expect(context7?.command).toBe("npx");
    });

    it("has docs-related tags", () => {
      const context7 = MCP_SERVER_PRESETS.find((p) => p.name === "context7");
      expect(context7?.tags).toContain("docs");
    });

    it("supports all agents", () => {
      const context7 = MCP_SERVER_PRESETS.find((p) => p.name === "context7");
      expect(context7?.supportedAgents.claude).toBe(true);
      expect(context7?.supportedAgents.codex).toBe(true);
      expect(context7?.supportedAgents.gemini).toBe(true);
      expect(context7?.supportedAgents.opencode).toBe(true);
    });
  });

  describe("github preset", () => {
    it("has github-related tags", () => {
      const github = MCP_SERVER_PRESETS.find((p) => p.name === "github");
      expect(github?.tags).toContain("github");
      expect(github?.tags).toContain("pull-requests");
    });
  });

  describe("filesystem preset", () => {
    it("has workspace path in args", () => {
      const filesystem = MCP_SERVER_PRESETS.find((p) => p.name === "filesystem");
      expect(filesystem?.args).toContain("/root/workspace");
    });

    it("has workspace-related tags", () => {
      const filesystem = MCP_SERVER_PRESETS.find((p) => p.name === "filesystem");
      expect(filesystem?.tags).toContain("workspace");
    });
  });
});
