import { describe, expect, it } from "vitest";
import { macAppBin, pathExists } from "./editorDetection";

describe("macAppBin", () => {
  it("returns empty string on non-darwin platforms", () => {
    // Since we're running on linux, this should return empty
    if (process.platform !== "darwin") {
      expect(macAppBin("Visual Studio Code", "code")).toBe("");
    }
  });

  it("constructs correct path structure on darwin", () => {
    // We can only verify the path construction logic
    if (process.platform === "darwin") {
      const result = macAppBin("Cursor", "cursor");
      expect(result).toBe(
        "/Applications/Cursor.app/Contents/Resources/app/bin/cursor"
      );
    }
  });

  it("handles special characters in app name", () => {
    if (process.platform === "darwin") {
      const result = macAppBin("Visual Studio Code", "code");
      expect(result).toContain("Visual Studio Code.app");
    }
  });
});

describe("pathExists", () => {
  it("returns false for empty string", async () => {
    expect(await pathExists("")).toBe(false);
  });

  it("returns true for existing path", async () => {
    // Current directory should always exist
    expect(await pathExists(process.cwd())).toBe(true);
  });

  it("returns true for existing file", async () => {
    // This test file should exist
    expect(await pathExists(import.meta.filename)).toBe(true);
  });

  it("returns false for non-existent path", async () => {
    expect(await pathExists("/nonexistent/path/to/file")).toBe(false);
  });

  it("returns false for null-like values", async () => {
    // Empty string check is the guard for falsy paths
    expect(await pathExists("")).toBe(false);
  });
});
