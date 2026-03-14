import { describe, expect, it } from "vitest";
import {
  buildSystemTimezoneStartupCommand,
  isValidTimezoneIdentifier,
} from "./timezone";

describe("isValidTimezoneIdentifier", () => {
  it("accepts common IANA timezone names", () => {
    expect(isValidTimezoneIdentifier("Asia/Tokyo")).toBe(true);
    expect(
      isValidTimezoneIdentifier("America/Argentina/Buenos_Aires")
    ).toBe(true);
    expect(isValidTimezoneIdentifier("Etc/GMT+8")).toBe(true);
    expect(isValidTimezoneIdentifier("UTC")).toBe(true);
  });

  it("rejects unsafe or malformed timezone values", () => {
    expect(isValidTimezoneIdentifier("")).toBe(false);
    expect(isValidTimezoneIdentifier("America/New York")).toBe(false);
    expect(isValidTimezoneIdentifier("../etc/passwd")).toBe(false);
    expect(isValidTimezoneIdentifier("Asia/Tokyo; rm -rf /")).toBe(false);
  });
});

describe("buildSystemTimezoneStartupCommand", () => {
  it("builds a non-fatal startup command for valid timezones", () => {
    const command = buildSystemTimezoneStartupCommand("Asia/Tokyo");

    expect(command).toContain("timedatectl set-timezone 'Asia/Tokyo'");
    expect(command).toContain("ln -snf '/usr/share/zoneinfo/Asia/Tokyo' /etc/localtime");
    expect(command).toContain("printf '%s\\n' 'Asia/Tokyo' > /etc/timezone");
    expect(command).toContain(
      "timezone %s not found, skipping system timezone update"
    );
  });

  it("returns null for invalid timezones", () => {
    expect(buildSystemTimezoneStartupCommand("Asia/Tokyo && whoami")).toBeNull();
  });
});
