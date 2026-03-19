import { describe, expect, it } from "vitest";
import { getWorkspaceUrl } from "./workspace-url";

describe("getWorkspaceUrl", () => {
  describe("returns null for invalid input", () => {
    it("returns null for null URL", () => {
      expect(getWorkspaceUrl(null, "docker", "http://localhost:39377")).toBeNull();
    });

    it("returns null for undefined URL", () => {
      expect(getWorkspaceUrl(undefined, "docker", "http://localhost:39377")).toBeNull();
    });

    it("returns null for empty string URL", () => {
      expect(getWorkspaceUrl("", "docker", "http://localhost:39377")).toBeNull();
    });
  });

  describe("docker provider", () => {
    it("returns URL directly without rewriting", () => {
      const result = getWorkspaceUrl(
        "http://localhost:39378?folder=/workspace",
        "docker",
        "http://localhost:39377"
      );
      // Docker URLs should not use local serve-web
      expect(result).toContain("localhost:39378");
    });
  });

  describe("morph provider", () => {
    it("returns URL directly without rewriting", () => {
      const result = getWorkspaceUrl(
        "https://port-39378-morphvm-abc123.http.cloud.morph.so?folder=/workspace",
        "morph",
        "http://localhost:39377"
      );
      // Morph URLs should be used directly
      expect(result).toContain("morph.so");
    });
  });

  describe("other provider (local workspace)", () => {
    it("rewrites localhost URL to local serve-web", () => {
      const result = getWorkspaceUrl(
        "http://localhost:39378?folder=/workspace",
        "other",
        "http://localhost:39377"
      );
      // Local workspaces should use serve-web
      expect(result).toContain("localhost:39377");
    });

    it("handles missing localServeWebBaseUrl gracefully", () => {
      const result = getWorkspaceUrl(
        "http://localhost:39378?folder=/workspace",
        "other",
        null
      );
      // Should return original URL when no serve-web URL provided
      expect(result).toBe("http://localhost:39378?folder=/workspace");
    });
  });

  describe("provider is undefined", () => {
    it("returns URL without rewriting", () => {
      const result = getWorkspaceUrl(
        "http://localhost:39378?folder=/workspace",
        undefined,
        "http://localhost:39377"
      );
      // Undefined provider should not use local serve-web
      expect(result).toContain("localhost:39378");
    });
  });
});
