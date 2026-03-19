import { describe, expect, it } from "vitest";
import { ampPlugin } from "./plugin";

describe("ampPlugin", () => {
  describe("manifest", () => {
    it("has id amp", () => {
      expect(ampPlugin.manifest.id).toBe("amp");
    });

    it("has name Sourcegraph AMP", () => {
      expect(ampPlugin.manifest.name).toBe("Sourcegraph AMP");
    });

    it("has version", () => {
      expect(ampPlugin.manifest.version).toBeTruthy();
    });

    it("is builtin type", () => {
      expect(ampPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has default base URL for Sourcegraph", () => {
      expect(ampPlugin.provider.defaultBaseUrl).toBe("https://sourcegraph.com");
    });

    it("uses passthrough api format", () => {
      expect(ampPlugin.provider.apiFormat).toBe("passthrough");
    });

    it("requires AMP_API_KEY", () => {
      expect(ampPlugin.provider.authEnvVars).toContain("AMP_API_KEY");
    });
  });

  describe("configs and catalog", () => {
    it("has configs array", () => {
      expect(Array.isArray(ampPlugin.configs)).toBe(true);
    });

    it("has catalog array", () => {
      expect(Array.isArray(ampPlugin.catalog)).toBe(true);
    });
  });
});
