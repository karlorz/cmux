import { describe, expect, it } from "vitest";
import { defaultHostConfig, getHostUrl, type HostConfig } from "./host-config";

describe("defaultHostConfig", () => {
  it("has all required host fields", () => {
    const requiredFields: (keyof HostConfig)[] = [
      "client",
      "server",
      "vscode",
      "opencode",
      "ampProxy",
      "sandboxApi",
    ];

    for (const field of requiredFields) {
      expect(defaultHostConfig).toHaveProperty(field);
      expect(typeof defaultHostConfig[field]).toBe("string");
    }
  });

  it("client host is localhost:5173", () => {
    expect(defaultHostConfig.client).toBe("localhost:5173");
  });

  it("server host is localhost:9779", () => {
    expect(defaultHostConfig.server).toBe("localhost:9779");
  });

  it("vscode host is localhost:39377", () => {
    expect(defaultHostConfig.vscode).toBe("localhost:39377");
  });

  it("sandboxApi host is localhost:46833", () => {
    expect(defaultHostConfig.sandboxApi).toBe("localhost:46833");
  });
});

describe("getHostUrl", () => {
  describe("basic URL construction", () => {
    it("constructs http URL with host only", () => {
      const result = getHostUrl("localhost:3000");
      expect(result).toBe("http://localhost:3000");
    });

    it("constructs http URL with host and path", () => {
      const result = getHostUrl("localhost:3000", "/api/v1");
      expect(result).toBe("http://localhost:3000/api/v1");
    });

    it("constructs https URL when specified", () => {
      const result = getHostUrl("example.com", "/api", "https");
      expect(result).toBe("https://example.com/api");
    });
  });

  describe("protocol stripping", () => {
    it("strips http:// prefix from host", () => {
      const result = getHostUrl("http://localhost:3000", "/test");
      expect(result).toBe("http://localhost:3000/test");
    });

    it("strips https:// prefix from host", () => {
      const result = getHostUrl("https://example.com", "/test", "http");
      expect(result).toBe("http://example.com/test");
    });

    it("handles host without protocol prefix", () => {
      const result = getHostUrl("api.example.com");
      expect(result).toBe("http://api.example.com");
    });
  });

  describe("path handling", () => {
    it("handles empty path", () => {
      const result = getHostUrl("localhost:3000", "");
      expect(result).toBe("http://localhost:3000");
    });

    it("handles path without leading slash", () => {
      const result = getHostUrl("localhost:3000", "api");
      expect(result).toBe("http://localhost:3000api");
    });

    it("handles path with leading slash", () => {
      const result = getHostUrl("localhost:3000", "/api");
      expect(result).toBe("http://localhost:3000/api");
    });

    it("handles complex paths", () => {
      const result = getHostUrl("localhost:3000", "/api/v1/users?id=123");
      expect(result).toBe("http://localhost:3000/api/v1/users?id=123");
    });
  });

  describe("default values", () => {
    it("defaults to empty path", () => {
      const result = getHostUrl("localhost:3000");
      expect(result).toBe("http://localhost:3000");
    });

    it("defaults to http protocol", () => {
      const result = getHostUrl("localhost:3000", "/test");
      expect(result).toBe("http://localhost:3000/test");
    });
  });
});
