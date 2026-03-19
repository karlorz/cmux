import { describe, expect, it } from "vitest";
import {
  getMainServerSocketOptions,
  getWorkerServerSocketOptions,
  extractQueryParam,
} from "./socket-server";

describe("getMainServerSocketOptions", () => {
  it("returns options with default origin", () => {
    const options = getMainServerSocketOptions();

    expect(options.cors).toEqual({
      origin: "http://localhost:5173",
      methods: ["GET", "POST"],
    });
  });

  it("accepts custom origin", () => {
    const options = getMainServerSocketOptions("https://example.com");

    expect(options.cors).toEqual({
      origin: "https://example.com",
      methods: ["GET", "POST"],
    });
  });

  it("sets maxHttpBufferSize to 50MB", () => {
    const options = getMainServerSocketOptions();
    expect(options.maxHttpBufferSize).toBe(50 * 1024 * 1024);
  });

  it("sets pingTimeout to 120 seconds", () => {
    const options = getMainServerSocketOptions();
    expect(options.pingTimeout).toBe(120_000);
  });

  it("sets pingInterval to 30 seconds", () => {
    const options = getMainServerSocketOptions();
    expect(options.pingInterval).toBe(30_000);
  });

  it("allows Engine.IO v3 clients", () => {
    const options = getMainServerSocketOptions();
    expect(options.allowEIO3).toBe(true);
  });
});

describe("getWorkerServerSocketOptions", () => {
  it("allows all origins", () => {
    const options = getWorkerServerSocketOptions();

    expect(options.cors).toEqual({
      origin: "*",
      methods: ["GET", "POST"],
    });
  });

  it("sets maxHttpBufferSize to 50MB", () => {
    const options = getWorkerServerSocketOptions();
    expect(options.maxHttpBufferSize).toBe(50 * 1024 * 1024);
  });

  it("sets pingTimeout to 240 seconds", () => {
    const options = getWorkerServerSocketOptions();
    expect(options.pingTimeout).toBe(240_000);
  });

  it("sets pingInterval to 30 seconds", () => {
    const options = getWorkerServerSocketOptions();
    expect(options.pingInterval).toBe(30_000);
  });

  it("sets upgradeTimeout to 30 seconds", () => {
    const options = getWorkerServerSocketOptions();
    expect(options.upgradeTimeout).toBe(30_000);
  });
});

describe("extractQueryParam", () => {
  describe("string input", () => {
    it("returns string value as-is", () => {
      expect(extractQueryParam("value")).toBe("value");
    });

    it("returns empty string", () => {
      expect(extractQueryParam("")).toBe("");
    });
  });

  describe("array input", () => {
    it("returns first element if string", () => {
      expect(extractQueryParam(["first", "second"])).toBe("first");
    });

    it("returns undefined for empty array", () => {
      expect(extractQueryParam([])).toBeUndefined();
    });

    it("returns undefined if first element is not string", () => {
      expect(extractQueryParam([123, "second"])).toBeUndefined();
    });

    it("handles array with single string element", () => {
      expect(extractQueryParam(["only"])).toBe("only");
    });
  });

  describe("other types", () => {
    it("returns undefined for number", () => {
      expect(extractQueryParam(123)).toBeUndefined();
    });

    it("returns undefined for object", () => {
      expect(extractQueryParam({ key: "value" })).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(extractQueryParam(null)).toBeUndefined();
    });

    it("returns undefined for undefined", () => {
      expect(extractQueryParam(undefined)).toBeUndefined();
    });

    it("returns undefined for boolean", () => {
      expect(extractQueryParam(true)).toBeUndefined();
    });
  });
});
