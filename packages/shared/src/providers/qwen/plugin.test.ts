import { describe, expect, it } from "vitest";
import { qwenPlugin } from "./plugin";

describe("qwenPlugin", () => {
  describe("manifest", () => {
    it("has id qwen", () => {
      expect(qwenPlugin.manifest.id).toBe("qwen");
    });

    it("has name Qwen", () => {
      expect(qwenPlugin.manifest.name).toBe("Qwen");
    });

    it("has version", () => {
      expect(qwenPlugin.manifest.version).toBeTruthy();
    });

    it("is builtin type", () => {
      expect(qwenPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has default base URL for ModelStudio/DashScope", () => {
      expect(qwenPlugin.provider.defaultBaseUrl).toContain("dashscope");
      expect(qwenPlugin.provider.defaultBaseUrl).toContain("aliyuncs.com");
    });

    it("uses openai api format", () => {
      expect(qwenPlugin.provider.apiFormat).toBe("openai");
    });

    it("requires MODEL_STUDIO_API_KEY", () => {
      expect(qwenPlugin.provider.authEnvVars).toContain("MODEL_STUDIO_API_KEY");
    });
  });

  describe("configs and catalog", () => {
    it("has configs array", () => {
      expect(Array.isArray(qwenPlugin.configs)).toBe(true);
    });

    it("has catalog array", () => {
      expect(Array.isArray(qwenPlugin.catalog)).toBe(true);
    });
  });
});
