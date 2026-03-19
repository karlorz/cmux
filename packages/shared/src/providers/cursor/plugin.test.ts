import { describe, expect, it } from "vitest";
import { cursorPlugin } from "./plugin";
import { CURSOR_API_KEY } from "../../apiKeys";
import { CURSOR_CATALOG } from "./catalog";
import { CURSOR_AGENT_CONFIGS } from "./configs";

describe("cursorPlugin", () => {
  describe("manifest", () => {
    it("has id cursor", () => {
      expect(cursorPlugin.manifest.id).toBe("cursor");
    });

    it("has name Cursor", () => {
      expect(cursorPlugin.manifest.name).toBe("Cursor");
    });

    it("has version 1.0.0", () => {
      expect(cursorPlugin.manifest.version).toBe("1.0.0");
    });

    it("has description", () => {
      expect(cursorPlugin.manifest.description).toBe(
        "Cursor agent for AI-powered code editing"
      );
    });

    it("has type builtin", () => {
      expect(cursorPlugin.manifest.type).toBe("builtin");
    });
  });

  describe("provider", () => {
    it("has defaultBaseUrl for cursor API", () => {
      expect(cursorPlugin.provider.defaultBaseUrl).toBe(
        "https://api.cursor.sh"
      );
    });

    it("has passthrough apiFormat", () => {
      expect(cursorPlugin.provider.apiFormat).toBe("passthrough");
    });

    it("has CURSOR_API_KEY as authEnvVar", () => {
      expect(cursorPlugin.provider.authEnvVars).toContain("CURSOR_API_KEY");
    });

    it("includes CURSOR_API_KEY in apiKeys", () => {
      expect(cursorPlugin.provider.apiKeys).toContain(CURSOR_API_KEY);
    });
  });

  describe("exports", () => {
    it("exports CURSOR_AGENT_CONFIGS as configs", () => {
      expect(cursorPlugin.configs).toBe(CURSOR_AGENT_CONFIGS);
    });

    it("exports CURSOR_CATALOG as catalog", () => {
      expect(cursorPlugin.catalog).toBe(CURSOR_CATALOG);
    });
  });
});
