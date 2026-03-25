import { describe, expect, it } from "vitest";
import { resolveTerminalRenderer } from "./terminal-renderer";

describe("resolveTerminalRenderer", () => {
  it("defaults to xterm when unset", () => {
    expect(resolveTerminalRenderer(undefined)).toBe("xterm");
    expect(resolveTerminalRenderer(null)).toBe("xterm");
  });

  it("returns ghostty only for the explicit ghostty flag", () => {
    expect(resolveTerminalRenderer("ghostty")).toBe("ghostty");
  });

  it("falls back to xterm for unknown values", () => {
    expect(resolveTerminalRenderer("xterm")).toBe("xterm");
    expect(resolveTerminalRenderer("unexpected")).toBe("xterm");
  });
});
