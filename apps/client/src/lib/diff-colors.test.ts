import { describe, expect, it } from "vitest";
import { diffColors, getDiffColorPalette } from "./diff-colors";

describe("diffColors", () => {
  describe("structure validation", () => {
    it("has light and dark themes", () => {
      expect(diffColors).toHaveProperty("light");
      expect(diffColors).toHaveProperty("dark");
    });

    it("each theme has addition, deletion, and collapsed sections", () => {
      for (const theme of ["light", "dark"] as const) {
        expect(diffColors[theme]).toHaveProperty("addition");
        expect(diffColors[theme]).toHaveProperty("deletion");
        expect(diffColors[theme]).toHaveProperty("collapsed");
      }
    });

    it("addition and deletion have required tone properties", () => {
      const requiredToneProps = [
        "lineBackground",
        "gutterBackground",
        "textBackground",
        "lineNumberForeground",
      ];

      for (const theme of ["light", "dark"] as const) {
        for (const section of ["addition", "deletion"] as const) {
          for (const prop of requiredToneProps) {
            expect(diffColors[theme][section]).toHaveProperty(prop);
            expect(typeof diffColors[theme][section][prop as keyof typeof diffColors.light.addition]).toBe("string");
          }
        }
      }
    });

    it("collapsed has required properties", () => {
      for (const theme of ["light", "dark"] as const) {
        expect(diffColors[theme].collapsed).toHaveProperty("background");
        expect(diffColors[theme].collapsed).toHaveProperty("foreground");
        expect(typeof diffColors[theme].collapsed.background).toBe("string");
        expect(typeof diffColors[theme].collapsed.foreground).toBe("string");
      }
    });
  });

  describe("color format validation", () => {
    it("light theme colors are valid hex codes", () => {
      // Light theme uses full hex codes
      expect(diffColors.light.addition.lineBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(diffColors.light.deletion.lineBackground).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("dark theme colors are valid hex codes (with alpha)", () => {
      // Dark theme uses hex with alpha channel
      expect(diffColors.dark.addition.lineBackground).toMatch(/^#[0-9a-fA-F]{6,8}$/);
      expect(diffColors.dark.deletion.lineBackground).toMatch(/^#[0-9a-fA-F]{6,8}$/);
    });
  });

  describe("semantic correctness", () => {
    it("light theme addition uses green-ish tones", () => {
      // Green components should be prominent in addition colors
      const lineNumberFg = diffColors.light.addition.lineNumberForeground;
      expect(lineNumberFg.toLowerCase()).toMatch(/#[0-9a-f]{2}[6-9a-f][0-9a-f]{3}/);
    });

    it("light theme deletion uses red-ish tones", () => {
      // Red components should be prominent in deletion colors
      const bg = diffColors.light.deletion.lineBackground;
      expect(bg.toLowerCase()).toMatch(/#f/);
    });
  });
});

describe("getDiffColorPalette", () => {
  it("returns light palette for light theme", () => {
    const palette = getDiffColorPalette("light");
    expect(palette).toBe(diffColors.light);
  });

  it("returns dark palette for dark theme", () => {
    const palette = getDiffColorPalette("dark");
    expect(palette).toBe(diffColors.dark);
  });

  it("returns a valid DiffColorPalette structure", () => {
    const palette = getDiffColorPalette("light");

    // Type check via property access
    expect(palette.addition).toBeDefined();
    expect(palette.deletion).toBeDefined();
    expect(palette.collapsed).toBeDefined();

    expect(palette.addition.lineBackground).toBe("#dafbe1");
    expect(palette.deletion.lineBackground).toBe("#ffebe9");
  });

  it("returns different palettes for different themes", () => {
    const lightPalette = getDiffColorPalette("light");
    const darkPalette = getDiffColorPalette("dark");

    expect(lightPalette).not.toBe(darkPalette);
    expect(lightPalette.addition.lineBackground).not.toBe(
      darkPalette.addition.lineBackground
    );
  });
});
