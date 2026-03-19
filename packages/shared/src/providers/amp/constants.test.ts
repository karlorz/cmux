import { describe, expect, it } from "vitest";
import { DEFAULT_AMP_PROXY_PORT, DEFAULT_AMP_PROXY_URL } from "./constants";

describe("DEFAULT_AMP_PROXY_PORT", () => {
  it("is 39400", () => {
    expect(DEFAULT_AMP_PROXY_PORT).toBe(39400);
  });

  it("is a number", () => {
    expect(typeof DEFAULT_AMP_PROXY_PORT).toBe("number");
  });
});

describe("DEFAULT_AMP_PROXY_URL", () => {
  it("contains localhost", () => {
    expect(DEFAULT_AMP_PROXY_URL).toContain("localhost");
  });

  it("uses http protocol", () => {
    expect(DEFAULT_AMP_PROXY_URL).toMatch(/^http:\/\//);
  });

  it("includes the default port", () => {
    expect(DEFAULT_AMP_PROXY_URL).toContain(String(DEFAULT_AMP_PROXY_PORT));
  });

  it("matches expected URL format", () => {
    expect(DEFAULT_AMP_PROXY_URL).toBe("http://localhost:39400");
  });
});
