import { describe, expect, it } from "vitest";
import {
  buildHeatmapGradientStyles,
  buildThemedHeatmapGradientStyles,
  DEFAULT_HEATMAP_COLORS,
  DARK_MODE_HEATMAP_COLORS,
  type HeatmapColorSettings,
} from "./heatmap-gradient";

describe("heatmap-gradient", () => {
  describe("constants", () => {
    it("DEFAULT_HEATMAP_COLORS has valid hex colors", () => {
      expect(DEFAULT_HEATMAP_COLORS.line.start).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DEFAULT_HEATMAP_COLORS.line.end).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DEFAULT_HEATMAP_COLORS.token.start).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DEFAULT_HEATMAP_COLORS.token.end).toMatch(/^#[0-9a-fA-F]{6}$/);
    });

    it("DARK_MODE_HEATMAP_COLORS has valid hex colors", () => {
      expect(DARK_MODE_HEATMAP_COLORS.line.start).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DARK_MODE_HEATMAP_COLORS.line.end).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DARK_MODE_HEATMAP_COLORS.token.start).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(DARK_MODE_HEATMAP_COLORS.token.end).toMatch(/^#[0-9a-fA-F]{6}$/);
    });
  });

  describe("buildHeatmapGradientStyles", () => {
    it("generates CSS rules for light mode", () => {
      const css = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "light");

      expect(css).toContain("cmux-heatmap-gradient-step-");
      expect(css).toContain("cmux-heatmap-char-gradient-step-");
      expect(css).toContain("box-shadow");
      expect(css).toContain("background-color");
      expect(css).toContain("rgba(");
    });

    it("generates CSS rules for dark mode", () => {
      const css = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "dark");

      expect(css).toContain("cmux-heatmap-gradient-step-");
      expect(css).toContain("cmux-heatmap-char-gradient-step-");
      expect(css).toContain("rgba(");
    });

    it("generates rules for all gradient steps", () => {
      const css = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "light");

      // Should have rules for steps 1-100
      expect(css).toContain("cmux-heatmap-gradient-step-1 ");
      expect(css).toContain("cmux-heatmap-gradient-step-50 ");
      expect(css).toContain("cmux-heatmap-gradient-step-100 ");
      expect(css).toContain("cmux-heatmap-char-gradient-step-1 ");
      expect(css).toContain("cmux-heatmap-char-gradient-step-100 ");
    });

    it("generates valid CSS syntax", () => {
      const css = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "light");

      // Each rule should have opening and closing braces
      const openBraces = (css.match(/{/g) ?? []).length;
      const closeBraces = (css.match(/}/g) ?? []).length;
      expect(openBraces).toBe(closeBraces);
      expect(openBraces).toBeGreaterThan(0);
    });

    it("handles custom colors", () => {
      const customColors: HeatmapColorSettings = {
        line: { start: "#ff0000", end: "#00ff00" },
        token: { start: "#0000ff", end: "#ffff00" },
      };

      const css = buildHeatmapGradientStyles(customColors, "light");

      expect(css).toContain("rgba(");
      expect(css).toContain("cmux-heatmap-gradient-step-");
    });

    it("uses fallback colors for invalid hex", () => {
      const invalidColors: HeatmapColorSettings = {
        line: { start: "invalid", end: "also-invalid" },
        token: { start: "nope", end: "nada" },
      };

      // Should not throw and should use fallback colors
      const css = buildHeatmapGradientStyles(invalidColors, "light");
      expect(css).toContain("rgba(");
    });

    it("defaults to light mode when no theme specified", () => {
      const lightCss = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS);
      const explicitLightCss = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "light");

      expect(lightCss).toBe(explicitLightCss);
    });

    it("produces different CSS for light vs dark mode", () => {
      const lightCss = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "light");
      const darkCss = buildHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS, "dark");

      // Alpha values should differ between modes
      expect(lightCss).not.toBe(darkCss);
    });
  });

  describe("buildThemedHeatmapGradientStyles", () => {
    it("generates both light and dark mode styles", () => {
      const css = buildThemedHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS);

      expect(css).toContain("Light mode heatmap styles");
      expect(css).toContain("Dark mode heatmap styles");
      expect(css).toContain(".dark {");
    });

    it("wraps dark mode rules in .dark selector", () => {
      const css = buildThemedHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS);

      // Dark mode rules should be inside .dark { ... }
      const darkSectionMatch = css.match(/\.dark \{[\s\S]+\}/);
      expect(darkSectionMatch).not.toBeNull();
      expect(darkSectionMatch?.[0]).toContain("cmux-heatmap-gradient-step-");
    });

    it("indents dark mode rules", () => {
      const css = buildThemedHeatmapGradientStyles(DEFAULT_HEATMAP_COLORS);

      // Rules inside .dark should be indented
      const lines = css.split("\n");
      const darkSectionStart = lines.findIndex((l) => l.includes(".dark {"));
      expect(darkSectionStart).toBeGreaterThan(-1);

      // Next non-empty line should be indented
      const nextRuleLine = lines
        .slice(darkSectionStart + 1)
        .find((l) => l.includes("cmux-heatmap-"));
      expect(nextRuleLine).toMatch(/^\s{2}/);
    });
  });
});
