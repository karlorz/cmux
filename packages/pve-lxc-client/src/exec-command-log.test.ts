import { describe, expect, it } from "vitest";
import { formatExecCommandForLog } from "./exec-command-log";

describe("formatExecCommandForLog", () => {
  it("redacts Mirror local upload payloads", () => {
    const command =
      "printf '%s' 'sensitive-base64-payload' | base64 -d >> '/tmp/cmux-mirror-fixed.tar.gz'";

    expect(formatExecCommandForLog(command)).toBe(
      "[redacted Mirror local upload chunk]",
    );
    expect(formatExecCommandForLog(command)).not.toContain("sensitive-base64");
  });

  it("preserves the existing command truncation behavior", () => {
    expect(formatExecCommandForLog("echo ready")).toBe("echo ready");
    expect(formatExecCommandForLog("x".repeat(101))).toBe(
      `${"x".repeat(100)}...`,
    );
  });
});
