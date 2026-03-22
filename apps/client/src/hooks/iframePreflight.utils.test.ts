import { describe, expect, it } from "vitest";
import {
  shouldUseIframePreflightProxy,
  shouldUseServerIframePreflight,
} from "./iframePreflight.utils";

describe("iframePreflight.utils", () => {
  describe("shouldUseIframePreflightProxy", () => {
    it("returns false for null input", () => {
      expect(shouldUseIframePreflightProxy(null)).toBe(false);
    });

    it("returns false for undefined input", () => {
      expect(shouldUseIframePreflightProxy(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(shouldUseIframePreflightProxy("")).toBe(false);
    });

    it("returns true for Morph instance URLs", () => {
      const morphUrl = "https://port-8080-morphvm-abc123.cmux.sh";
      expect(shouldUseIframePreflightProxy(morphUrl)).toBe(true);
    });

    it("returns true for Morph instance URL objects", () => {
      const morphUrl = new URL("https://port-8080-morphvm-abc123.cmux.sh");
      expect(shouldUseIframePreflightProxy(morphUrl)).toBe(true);
    });

    it("returns true for PVE-LXC instance URLs", () => {
      const pveUrl = "https://port-3000-pvelxc-abc123.alphasolves.com";
      expect(shouldUseIframePreflightProxy(pveUrl)).toBe(true);
    });

    it("returns false for regular URLs", () => {
      expect(shouldUseIframePreflightProxy("https://example.com")).toBe(false);
      expect(shouldUseIframePreflightProxy("https://github.com")).toBe(false);
    });

    it("returns false for localhost URLs", () => {
      expect(shouldUseIframePreflightProxy("http://localhost:3000")).toBe(false);
      expect(shouldUseIframePreflightProxy("http://127.0.0.1:8080")).toBe(false);
    });

    it("returns false for invalid URLs", () => {
      expect(shouldUseIframePreflightProxy("not-a-url")).toBe(false);
      expect(shouldUseIframePreflightProxy("://missing-protocol")).toBe(false);
    });

    it("handles URLs with paths and query params", () => {
      const morphUrl = "https://port-8080-morphvm-abc123.cmux.sh/api/data?key=value";
      expect(shouldUseIframePreflightProxy(morphUrl)).toBe(true);
    });
  });

  describe("shouldUseServerIframePreflight", () => {
    it("returns false for null input", () => {
      expect(shouldUseServerIframePreflight(null)).toBe(false);
    });

    it("returns false for undefined input", () => {
      expect(shouldUseServerIframePreflight(undefined)).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(shouldUseServerIframePreflight("")).toBe(false);
    });

    it("returns true for localhost URLs", () => {
      expect(shouldUseServerIframePreflight("http://localhost")).toBe(true);
      expect(shouldUseServerIframePreflight("http://localhost:3000")).toBe(true);
      expect(shouldUseServerIframePreflight("https://localhost:8080")).toBe(true);
    });

    it("returns true for localhost URL objects", () => {
      expect(shouldUseServerIframePreflight(new URL("http://localhost:3000"))).toBe(true);
    });

    it("returns true for 127.0.0.1 URLs", () => {
      expect(shouldUseServerIframePreflight("http://127.0.0.1")).toBe(true);
      expect(shouldUseServerIframePreflight("http://127.0.0.1:8080")).toBe(true);
    });

    it("returns true for IPv6 loopback URLs", () => {
      expect(shouldUseServerIframePreflight("http://[::1]")).toBe(true);
      expect(shouldUseServerIframePreflight("http://[::1]:3000")).toBe(true);
    });

    it("returns false for remote URLs", () => {
      expect(shouldUseServerIframePreflight("https://example.com")).toBe(false);
      expect(shouldUseServerIframePreflight("https://api.github.com")).toBe(false);
    });

    it("returns false for Morph instance URLs", () => {
      const morphUrl = "https://port-8080-morphvm-abc123.cmux.sh";
      expect(shouldUseServerIframePreflight(morphUrl)).toBe(false);
    });

    it("returns false for invalid URLs", () => {
      expect(shouldUseServerIframePreflight("not-a-url")).toBe(false);
    });

    it("handles URLs with paths and query params", () => {
      expect(shouldUseServerIframePreflight("http://localhost:3000/api?key=value")).toBe(true);
    });
  });
});
