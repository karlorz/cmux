import { describe, expect, it } from "vitest";
import { DEFAULT_SANDBOX_TIMEZONE } from "./timezone-constants";

describe("DEFAULT_SANDBOX_TIMEZONE", () => {
  it("is Asia/Hong_Kong", () => {
    expect(DEFAULT_SANDBOX_TIMEZONE).toBe("Asia/Hong_Kong");
  });

  it("is a valid IANA timezone format", () => {
    // IANA timezones follow Area/Location pattern
    expect(DEFAULT_SANDBOX_TIMEZONE).toMatch(/^[A-Za-z]+\/[A-Za-z_]+$/);
  });

  it("is a non-empty string", () => {
    expect(typeof DEFAULT_SANDBOX_TIMEZONE).toBe("string");
    expect(DEFAULT_SANDBOX_TIMEZONE.length).toBeGreaterThan(0);
  });
});
