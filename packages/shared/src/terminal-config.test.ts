import { describe, expect, it } from "vitest";
import {
  ACTIVE_TERMINAL_SCROLLBACK,
  INACTIVE_TERMINAL_SCROLLBACK,
  DEFAULT_TERMINAL_CONFIG,
  SERVER_TERMINAL_CONFIG,
  createTerminalOptions,
} from "./terminal-config";

describe("terminal constants", () => {
  it("ACTIVE_TERMINAL_SCROLLBACK is defined", () => {
    expect(ACTIVE_TERMINAL_SCROLLBACK).toBe(20_000);
  });

  it("INACTIVE_TERMINAL_SCROLLBACK is defined", () => {
    expect(INACTIVE_TERMINAL_SCROLLBACK).toBe(2_000);
  });

  it("inactive scrollback is less than active", () => {
    expect(INACTIVE_TERMINAL_SCROLLBACK).toBeLessThan(
      ACTIVE_TERMINAL_SCROLLBACK
    );
  });
});

describe("DEFAULT_TERMINAL_CONFIG", () => {
  it("has required font settings", () => {
    expect(DEFAULT_TERMINAL_CONFIG.fontSize).toBe(12);
    expect(DEFAULT_TERMINAL_CONFIG.fontFamily).toContain("Menlo");
  });

  it("has theme with all basic colors", () => {
    const theme = DEFAULT_TERMINAL_CONFIG.theme!;
    expect(theme.background).toBeDefined();
    expect(theme.foreground).toBeDefined();
    expect(theme.cursor).toBeDefined();
    expect(theme.black).toBeDefined();
    expect(theme.red).toBeDefined();
    expect(theme.green).toBeDefined();
    expect(theme.yellow).toBeDefined();
    expect(theme.blue).toBeDefined();
    expect(theme.magenta).toBeDefined();
    expect(theme.cyan).toBeDefined();
    expect(theme.white).toBeDefined();
  });

  it("has theme with bright colors", () => {
    const theme = DEFAULT_TERMINAL_CONFIG.theme!;
    expect(theme.brightBlack).toBeDefined();
    expect(theme.brightRed).toBeDefined();
    expect(theme.brightGreen).toBeDefined();
    expect(theme.brightYellow).toBeDefined();
    expect(theme.brightBlue).toBeDefined();
    expect(theme.brightMagenta).toBeDefined();
    expect(theme.brightCyan).toBeDefined();
    expect(theme.brightWhite).toBeDefined();
  });

  it("has cursor settings", () => {
    expect(DEFAULT_TERMINAL_CONFIG.cursorStyle).toBe("bar");
    expect(DEFAULT_TERMINAL_CONFIG.cursorBlink).toBe(false);
  });

  it("uses active scrollback", () => {
    expect(DEFAULT_TERMINAL_CONFIG.scrollback).toBe(ACTIVE_TERMINAL_SCROLLBACK);
  });
});

describe("SERVER_TERMINAL_CONFIG", () => {
  it("has standard terminal dimensions", () => {
    expect(SERVER_TERMINAL_CONFIG.cols).toBe(80);
    expect(SERVER_TERMINAL_CONFIG.rows).toBe(24);
  });

  it("uses active scrollback", () => {
    expect(SERVER_TERMINAL_CONFIG.scrollback).toBe(ACTIVE_TERMINAL_SCROLLBACK);
  });

  it("allows proposed API", () => {
    expect(SERVER_TERMINAL_CONFIG.allowProposedApi).toBe(true);
  });
});

describe("createTerminalOptions", () => {
  it("returns default config when no overrides", () => {
    const result = createTerminalOptions();
    expect(result.fontSize).toBe(DEFAULT_TERMINAL_CONFIG.fontSize);
    expect(result.fontFamily).toBe(DEFAULT_TERMINAL_CONFIG.fontFamily);
    expect(result.cursorStyle).toBe(DEFAULT_TERMINAL_CONFIG.cursorStyle);
  });

  it("overrides top-level options", () => {
    const result = createTerminalOptions({ fontSize: 14, cursorBlink: true });
    expect(result.fontSize).toBe(14);
    expect(result.cursorBlink).toBe(true);
    expect(result.fontFamily).toBe(DEFAULT_TERMINAL_CONFIG.fontFamily);
  });

  it("merges theme options", () => {
    const result = createTerminalOptions({
      theme: { background: "#000000" },
    });
    expect(result.theme?.background).toBe("#000000");
    expect(result.theme?.foreground).toBe(
      DEFAULT_TERMINAL_CONFIG.theme?.foreground
    );
  });

  it("preserves default theme colors when overriding one", () => {
    const result = createTerminalOptions({
      theme: { cursor: "#ffffff" },
    });
    expect(result.theme?.cursor).toBe("#ffffff");
    expect(result.theme?.red).toBe(DEFAULT_TERMINAL_CONFIG.theme?.red);
    expect(result.theme?.green).toBe(DEFAULT_TERMINAL_CONFIG.theme?.green);
  });

  it("handles empty overrides object", () => {
    const result = createTerminalOptions({});
    expect(result).toEqual(DEFAULT_TERMINAL_CONFIG);
  });

  it("handles undefined theme in overrides", () => {
    const result = createTerminalOptions({ fontSize: 16 });
    expect(result.theme).toEqual(DEFAULT_TERMINAL_CONFIG.theme);
  });
});
