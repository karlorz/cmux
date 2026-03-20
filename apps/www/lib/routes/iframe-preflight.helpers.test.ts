import { describe, expect, it } from "vitest";

import { isAllowedHost } from "./iframe-preflight.helpers";

describe("isAllowedHost", () => {
  it("allows configured exact hosts", () => {
    expect(isAllowedHost("cmux.sh")).toBe(true);
    expect(isAllowedHost("www.manaflow.com")).toBe(true);
  });

  it("allows configured host suffixes", () => {
    expect(isAllowedHost("preview.cmux.app")).toBe(true);
    expect(isAllowedHost("port-39379-morphvm-abc.http.cloud.morph.so")).toBe(
      true,
    );
  });

  it("allows localhost in non-production environments", () => {
    expect(isAllowedHost("localhost")).toBe(true);
    expect(isAllowedHost("127.0.0.1")).toBe(true);
  });

  it("rejects unrelated hosts", () => {
    expect(isAllowedHost("example.com")).toBe(false);
    expect(isAllowedHost("malicious.internal")).toBe(false);
  });
});
