import { describe, expect, it } from "vitest";
import {
  normalizeHeatmapModel,
  normalizeTooltipLanguage,
  normalizeHeatmapColors,
  DEFAULT_HEATMAP_MODEL,
  DEFAULT_TOOLTIP_LANGUAGE,
} from "./heatmap-settings";
import { DEFAULT_HEATMAP_COLORS } from "@/components/heatmap-diff-viewer/heatmap-gradient";

describe("normalizeHeatmapModel", () => {
  describe("valid models", () => {
    it("returns valid model as-is", () => {
      expect(normalizeHeatmapModel("anthropic-haiku-4-5")).toBe(
        "anthropic-haiku-4-5"
      );
    });

    it("returns cmux-heatmap models as-is", () => {
      expect(normalizeHeatmapModel("cmux-heatmap-0")).toBe("cmux-heatmap-0");
      expect(normalizeHeatmapModel("cmux-heatmap-1")).toBe("cmux-heatmap-1");
      expect(normalizeHeatmapModel("cmux-heatmap-2")).toBe("cmux-heatmap-2");
    });
  });

  describe("legacy model migration", () => {
    it("migrates anthropic-opus-4-5 to default", () => {
      expect(normalizeHeatmapModel("anthropic-opus-4-5")).toBe(
        DEFAULT_HEATMAP_MODEL
      );
    });

    it("migrates anthropic to default", () => {
      expect(normalizeHeatmapModel("anthropic")).toBe(DEFAULT_HEATMAP_MODEL);
    });
  });

  describe("fallback behavior", () => {
    it("returns default for unknown model", () => {
      expect(normalizeHeatmapModel("unknown-model")).toBe(DEFAULT_HEATMAP_MODEL);
    });

    it("returns default for null", () => {
      expect(normalizeHeatmapModel(null)).toBe(DEFAULT_HEATMAP_MODEL);
    });

    it("returns default for undefined", () => {
      expect(normalizeHeatmapModel(undefined)).toBe(DEFAULT_HEATMAP_MODEL);
    });

    it("returns default for empty string", () => {
      expect(normalizeHeatmapModel("")).toBe(DEFAULT_HEATMAP_MODEL);
    });
  });
});

describe("normalizeTooltipLanguage", () => {
  describe("valid languages", () => {
    it("returns English for 'en'", () => {
      expect(normalizeTooltipLanguage("en")).toBe("en");
    });

    it("returns Chinese Traditional for 'zh-Hant'", () => {
      expect(normalizeTooltipLanguage("zh-Hant")).toBe("zh-Hant");
    });

    it("returns Japanese for 'ja'", () => {
      expect(normalizeTooltipLanguage("ja")).toBe("ja");
    });

    it("returns all supported languages", () => {
      const languages = [
        "en",
        "zh-Hant",
        "zh-Hans",
        "ja",
        "ko",
        "es",
        "fr",
        "de",
        "pt",
        "ru",
        "hi",
        "bn",
        "te",
        "mr",
        "ta",
        "gu",
        "kn",
        "ml",
        "pa",
        "ar",
        "vi",
        "th",
        "id",
      ];
      for (const lang of languages) {
        expect(normalizeTooltipLanguage(lang)).toBe(lang);
      }
    });
  });

  describe("fallback behavior", () => {
    it("returns default for unknown language", () => {
      expect(normalizeTooltipLanguage("invalid")).toBe(DEFAULT_TOOLTIP_LANGUAGE);
    });

    it("returns default for null", () => {
      expect(normalizeTooltipLanguage(null)).toBe(DEFAULT_TOOLTIP_LANGUAGE);
    });

    it("returns default for undefined", () => {
      expect(normalizeTooltipLanguage(undefined)).toBe(DEFAULT_TOOLTIP_LANGUAGE);
    });
  });
});

describe("normalizeHeatmapColors", () => {
  describe("valid colors", () => {
    it("accepts valid hex colors with hash", () => {
      const colors = {
        line: { start: "#ff0000", end: "#00ff00" },
        token: { start: "#0000ff", end: "#ffff00" },
      };
      const result = normalizeHeatmapColors(colors);
      expect(result).toEqual(colors);
    });

    it("normalizes colors to lowercase", () => {
      const colors = {
        line: { start: "#FF0000", end: "#00FF00" },
        token: { start: "#0000FF", end: "#FFFF00" },
      };
      const result = normalizeHeatmapColors(colors);
      expect(result.line.start).toBe("#ff0000");
      expect(result.token.end).toBe("#ffff00");
    });

    it("accepts 3-character hex colors", () => {
      const colors = {
        line: { start: "#f00", end: "#0f0" },
        token: { start: "#00f", end: "#ff0" },
      };
      const result = normalizeHeatmapColors(colors);
      expect(result.line.start).toBe("#f00");
    });

    it("adds hash if missing", () => {
      const colors = {
        line: { start: "ff0000", end: "00ff00" },
        token: { start: "0000ff", end: "ffff00" },
      };
      const result = normalizeHeatmapColors(colors);
      expect(result.line.start).toBe("#ff0000");
    });
  });

  describe("fallback behavior", () => {
    it("returns default for invalid schema", () => {
      expect(normalizeHeatmapColors({})).toEqual(DEFAULT_HEATMAP_COLORS);
      expect(normalizeHeatmapColors({ line: {} })).toEqual(
        DEFAULT_HEATMAP_COLORS
      );
    });

    it("returns default for invalid hex color", () => {
      const colors = {
        line: { start: "#gggggg", end: "#00ff00" },
        token: { start: "#0000ff", end: "#ffff00" },
      };
      expect(normalizeHeatmapColors(colors)).toEqual(DEFAULT_HEATMAP_COLORS);
    });

    it("returns default for empty color string", () => {
      const colors = {
        line: { start: "", end: "#00ff00" },
        token: { start: "#0000ff", end: "#ffff00" },
      };
      expect(normalizeHeatmapColors(colors)).toEqual(DEFAULT_HEATMAP_COLORS);
    });

    it("returns default for null input", () => {
      expect(normalizeHeatmapColors(null)).toEqual(DEFAULT_HEATMAP_COLORS);
    });

    it("returns default for non-object input", () => {
      expect(normalizeHeatmapColors("string")).toEqual(DEFAULT_HEATMAP_COLORS);
      expect(normalizeHeatmapColors(123)).toEqual(DEFAULT_HEATMAP_COLORS);
    });
  });
});
