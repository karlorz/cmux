import { describe, expect, it } from "vitest";
import { getHostUrl, DEFAULT_HOSTS } from "./host-env";

describe("host-env", () => {
  describe("getHostUrl", () => {
    it("builds URL with default http protocol", () => {
      expect(getHostUrl("localhost:5173")).toBe("http://localhost:5173");
    });

    it("builds URL with explicit http protocol", () => {
      expect(getHostUrl("localhost:5173", "", "http")).toBe(
        "http://localhost:5173"
      );
    });

    it("builds URL with https protocol", () => {
      expect(getHostUrl("localhost:5173", "", "https")).toBe(
        "https://localhost:5173"
      );
    });

    it("appends path to URL", () => {
      expect(getHostUrl("localhost:5173", "/api/health")).toBe(
        "http://localhost:5173/api/health"
      );
    });

    it("appends path with https", () => {
      expect(getHostUrl("api.example.com", "/v1/users", "https")).toBe(
        "https://api.example.com/v1/users"
      );
    });

    it("strips existing http:// protocol from host", () => {
      expect(getHostUrl("http://localhost:5173")).toBe("http://localhost:5173");
    });

    it("strips existing https:// protocol from host", () => {
      expect(getHostUrl("https://localhost:5173")).toBe("http://localhost:5173");
    });

    it("strips protocol and applies new protocol", () => {
      expect(getHostUrl("http://localhost:5173", "", "https")).toBe(
        "https://localhost:5173"
      );
    });

    it("handles empty path", () => {
      expect(getHostUrl("localhost:9779", "")).toBe("http://localhost:9779");
    });

    it("handles host without port", () => {
      expect(getHostUrl("example.com", "/api")).toBe("http://example.com/api");
    });

    it("handles IP addresses", () => {
      expect(getHostUrl("127.0.0.1", "/health")).toBe(
        "http://127.0.0.1/health"
      );
    });

    it("handles IP address with port", () => {
      expect(getHostUrl("192.168.1.1:8080", "/api")).toBe(
        "http://192.168.1.1:8080/api"
      );
    });
  });

  describe("DEFAULT_HOSTS", () => {
    it("has CLIENT host defined", () => {
      expect(DEFAULT_HOSTS.CLIENT).toBe("localhost:5173");
    });

    it("has SERVER host defined", () => {
      expect(DEFAULT_HOSTS.SERVER).toBe("localhost:9779");
    });

    it("has VSCODE host defined", () => {
      expect(DEFAULT_HOSTS.VSCODE).toBe("localhost:39377");
    });

    it("has OPENCODE host defined", () => {
      expect(DEFAULT_HOSTS.OPENCODE).toBe("127.0.0.1");
    });

    it("has AMP_PROXY host defined", () => {
      expect(DEFAULT_HOSTS.AMP_PROXY).toBe("localhost");
    });

    it("has SANDBOX_API host defined", () => {
      expect(DEFAULT_HOSTS.SANDBOX_API).toBe("localhost:46833");
    });

    it("has exactly 6 host configurations", () => {
      expect(Object.keys(DEFAULT_HOSTS)).toHaveLength(6);
    });
  });
});
