import { describe, expect, it } from "vitest";
import {
  buildHeatmapLineClass,
  buildHeatmapCharClass,
  extractHeatmapGradientStep,
  HEATMAP_LINE_CLASS_PREFIX,
  HEATMAP_CHAR_CLASS_PREFIX,
  HEATMAP_GRADIENT_STEPS,
  parseReviewHeatmap,
} from "./heatmap";

describe("heatmap utilities", () => {
  describe("buildHeatmapLineClass", () => {
    it("builds class name with step value", () => {
      expect(buildHeatmapLineClass(50)).toBe(`${HEATMAP_LINE_CLASS_PREFIX}-50`);
    });

    it("handles step 0", () => {
      expect(buildHeatmapLineClass(0)).toBe(`${HEATMAP_LINE_CLASS_PREFIX}-0`);
    });

    it("handles maximum step", () => {
      expect(buildHeatmapLineClass(HEATMAP_GRADIENT_STEPS)).toBe(
        `${HEATMAP_LINE_CLASS_PREFIX}-${HEATMAP_GRADIENT_STEPS}`
      );
    });

    it("handles step 1", () => {
      expect(buildHeatmapLineClass(1)).toBe(`${HEATMAP_LINE_CLASS_PREFIX}-1`);
    });
  });

  describe("buildHeatmapCharClass", () => {
    it("builds class for new side", () => {
      const result = buildHeatmapCharClass("new", 75);
      expect(result).toContain("cmux-heatmap-char");
      expect(result).toContain("cmux-heatmap-char-new");
      expect(result).toContain(`${HEATMAP_CHAR_CLASS_PREFIX}-75`);
    });

    it("builds class for old side", () => {
      const result = buildHeatmapCharClass("old", 25);
      expect(result).toContain("cmux-heatmap-char");
      expect(result).toContain("cmux-heatmap-char-old");
      expect(result).toContain(`${HEATMAP_CHAR_CLASS_PREFIX}-25`);
    });

    it("handles step 0", () => {
      const result = buildHeatmapCharClass("new", 0);
      expect(result).toContain(`${HEATMAP_CHAR_CLASS_PREFIX}-0`);
    });

    it("handles maximum step", () => {
      const result = buildHeatmapCharClass("old", HEATMAP_GRADIENT_STEPS);
      expect(result).toContain(`${HEATMAP_CHAR_CLASS_PREFIX}-${HEATMAP_GRADIENT_STEPS}`);
    });
  });

  describe("extractHeatmapGradientStep", () => {
    it("extracts step from valid class name", () => {
      expect(extractHeatmapGradientStep(`${HEATMAP_LINE_CLASS_PREFIX}-50`)).toBe(50);
    });

    it("extracts step 0", () => {
      expect(extractHeatmapGradientStep(`${HEATMAP_LINE_CLASS_PREFIX}-0`)).toBe(0);
    });

    it("extracts step from maximum value", () => {
      expect(
        extractHeatmapGradientStep(`${HEATMAP_LINE_CLASS_PREFIX}-${HEATMAP_GRADIENT_STEPS}`)
      ).toBe(HEATMAP_GRADIENT_STEPS);
    });

    it("returns 0 for non-matching class name", () => {
      expect(extractHeatmapGradientStep("some-other-class")).toBe(0);
    });

    it("returns 0 for empty string", () => {
      expect(extractHeatmapGradientStep("")).toBe(0);
    });

    it("extracts from class name with multiple classes", () => {
      expect(
        extractHeatmapGradientStep(`foo bar ${HEATMAP_LINE_CLASS_PREFIX}-75 baz`)
      ).toBe(75);
    });

    it("extracts first match when multiple present", () => {
      // regex.match returns first match
      expect(
        extractHeatmapGradientStep(`${HEATMAP_LINE_CLASS_PREFIX}-10 ${HEATMAP_LINE_CLASS_PREFIX}-20`)
      ).toBe(10);
    });
  });

  describe("parseReviewHeatmap", () => {
    describe("valid input", () => {
      it("parses simple heatmap with line numbers", () => {
        const input = {
          lines: [
            {
              line: 10,
              shouldBeReviewedScore: 0.8,
              shouldReviewWhy: "Important change",
              mostImportantWord: "function",
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]).toEqual({
          lineNumber: 10,
          lineText: null,
          score: 0.8,
          reason: "Important change",
          mostImportantWord: "function",
        });
      });

      it("parses heatmap with line text instead of number", () => {
        const input = {
          lines: [
            {
              line: "const x = 1;",
              shouldBeReviewedScore: 0.5,
              shouldReviewWhy: null,
              mostImportantWord: null,
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineText).toBe("const x = 1;");
        expect(result[0]?.lineNumber).toBeNull();
      });

      it("parses heatmap with string line number", () => {
        const input = {
          lines: [
            {
              line: "42",
              shouldBeReviewedScore: 0.7,
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(42);
      });

      it("parses heatmap with 'line N' format", () => {
        const input = {
          lines: [
            {
              line: "line 25",
              shouldBeReviewedScore: 0.6,
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(25);
      });

      it("normalizes scores above 1 to 1", () => {
        const input = {
          lines: [
            {
              line: 5,
              shouldBeReviewedScore: 1.5, // Should be clamped to 1
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.score).toBe(1);
      });

      it("sorts entries by line number", () => {
        const input = {
          lines: [
            { line: 30, shouldBeReviewedScore: 0.5 },
            { line: 10, shouldBeReviewedScore: 0.5 },
            { line: 20, shouldBeReviewedScore: 0.5 },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(3);
        expect(result[0]?.lineNumber).toBe(10);
        expect(result[1]?.lineNumber).toBe(20);
        expect(result[2]?.lineNumber).toBe(30);
      });

      it("filters out diamond characters from reason", () => {
        const input = {
          lines: [
            {
              line: 1,
              shouldBeReviewedScore: 0.5,
              shouldReviewWhy: "◆ Important change",
            },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result[0]?.reason).toBe("Important change");
      });
    });

    describe("invalid/edge case input", () => {
      it("returns empty array for null", () => {
        expect(parseReviewHeatmap(null)).toEqual([]);
      });

      it("returns empty array for undefined", () => {
        expect(parseReviewHeatmap(undefined)).toEqual([]);
      });

      it("returns empty array for empty object", () => {
        expect(parseReviewHeatmap({})).toEqual([]);
      });

      it("returns empty array for missing lines property", () => {
        expect(parseReviewHeatmap({ foo: "bar" })).toEqual([]);
      });

      it("returns empty array for empty lines array", () => {
        expect(parseReviewHeatmap({ lines: [] })).toEqual([]);
      });

      it("filters out entries with zero score", () => {
        const input = {
          lines: [
            { line: 1, shouldBeReviewedScore: 0 },
            { line: 2, shouldBeReviewedScore: 0.5 },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(2);
      });

      it("filters out entries with negative score", () => {
        const input = {
          lines: [
            { line: 1, shouldBeReviewedScore: -0.5 },
            { line: 2, shouldBeReviewedScore: 0.5 },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(2);
      });

      it("filters out entries with null score", () => {
        const input = {
          lines: [
            { line: 1, shouldBeReviewedScore: null },
            { line: 2, shouldBeReviewedScore: 0.5 },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(2);
      });

      it("filters out entries with invalid line number (negative)", () => {
        const input = {
          lines: [
            { line: -5, shouldBeReviewedScore: 0.5 },
            { line: 5, shouldBeReviewedScore: 0.5 },
          ],
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
        expect(result[0]?.lineNumber).toBe(5);
      });
    });

    describe("nested/wrapped payloads", () => {
      it("unwraps response wrapper", () => {
        const input = {
          response: {
            lines: [{ line: 1, shouldBeReviewedScore: 0.5 }],
          },
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
      });

      it("unwraps payload wrapper", () => {
        const input = {
          payload: {
            lines: [{ line: 1, shouldBeReviewedScore: 0.5 }],
          },
        };
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
      });

      it("parses JSON string input", () => {
        const input = JSON.stringify({
          lines: [{ line: 1, shouldBeReviewedScore: 0.5 }],
        });
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
      });

      it("handles double-wrapped JSON string", () => {
        const inner = { lines: [{ line: 1, shouldBeReviewedScore: 0.5 }] };
        const input = JSON.stringify({ response: JSON.stringify(inner) });
        const result = parseReviewHeatmap(input);
        expect(result).toHaveLength(1);
      });
    });
  });

  describe("constants", () => {
    it("HEATMAP_GRADIENT_STEPS is 100", () => {
      expect(HEATMAP_GRADIENT_STEPS).toBe(100);
    });

    it("HEATMAP_LINE_CLASS_PREFIX is correct", () => {
      expect(HEATMAP_LINE_CLASS_PREFIX).toBe("cmux-heatmap-gradient-step");
    });

    it("HEATMAP_CHAR_CLASS_PREFIX is correct", () => {
      expect(HEATMAP_CHAR_CLASS_PREFIX).toBe("cmux-heatmap-char-gradient-step");
    });
  });
});
