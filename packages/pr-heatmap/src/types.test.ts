import { describe, expect, it } from "vitest";
import { LineHeatmapSchema, FileHeatmapSchema } from "./types";

describe("pr-heatmap types", () => {
  describe("LineHeatmapSchema", () => {
    it("accepts valid line heatmap", () => {
      const result = LineHeatmapSchema.safeParse({
        line: "const x = 1;",
        lineNumber: 42,
        hasChanged: true,
        shouldBeReviewedScore: 8,
        shouldReviewWhy: "Critical logic change",
        mostImportantCharacterIndex: 6,
      });
      expect(result.success).toBe(true);
    });

    it("accepts minimal required fields", () => {
      const result = LineHeatmapSchema.safeParse({
        line: "  return result;",
        lineNumber: 1,
        hasChanged: false,
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing line field", () => {
      const result = LineHeatmapSchema.safeParse({
        lineNumber: 1,
        hasChanged: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing lineNumber field", () => {
      const result = LineHeatmapSchema.safeParse({
        line: "code",
        hasChanged: true,
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing hasChanged field", () => {
      const result = LineHeatmapSchema.safeParse({
        line: "code",
        lineNumber: 1,
      });
      expect(result.success).toBe(false);
    });

    it("validates shouldBeReviewedScore range 0-10", () => {
      const validMin = LineHeatmapSchema.safeParse({
        line: "code",
        lineNumber: 1,
        hasChanged: true,
        shouldBeReviewedScore: 0,
      });
      expect(validMin.success).toBe(true);

      const validMax = LineHeatmapSchema.safeParse({
        line: "code",
        lineNumber: 1,
        hasChanged: true,
        shouldBeReviewedScore: 10,
      });
      expect(validMax.success).toBe(true);

      const tooHigh = LineHeatmapSchema.safeParse({
        line: "code",
        lineNumber: 1,
        hasChanged: true,
        shouldBeReviewedScore: 11,
      });
      expect(tooHigh.success).toBe(false);

      const tooLow = LineHeatmapSchema.safeParse({
        line: "code",
        lineNumber: 1,
        hasChanged: true,
        shouldBeReviewedScore: -1,
      });
      expect(tooLow.success).toBe(false);
    });

    it("accepts empty string for line", () => {
      const result = LineHeatmapSchema.safeParse({
        line: "",
        lineNumber: 1,
        hasChanged: false,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("FileHeatmapSchema", () => {
    it("accepts valid file heatmap", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [
          { line: "code", lineNumber: 1, hasChanged: true },
        ],
        fileSummary: "Added authentication logic",
        overallRiskScore: 7,
        suggestedFocusAreas: ["auth handler", "token validation", "error handling"],
      });
      expect(result.success).toBe(true);
    });

    it("accepts empty lines array", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "No changes",
        overallRiskScore: 0,
        suggestedFocusAreas: [],
      });
      expect(result.success).toBe(true);
    });

    it("rejects missing lines", () => {
      const result = FileHeatmapSchema.safeParse({
        fileSummary: "Summary",
        overallRiskScore: 5,
        suggestedFocusAreas: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing fileSummary", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [],
        overallRiskScore: 5,
        suggestedFocusAreas: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing overallRiskScore", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        suggestedFocusAreas: [],
      });
      expect(result.success).toBe(false);
    });

    it("rejects missing suggestedFocusAreas", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        overallRiskScore: 5,
      });
      expect(result.success).toBe(false);
    });

    it("validates overallRiskScore range 0-10", () => {
      const validMin = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        overallRiskScore: 0,
        suggestedFocusAreas: [],
      });
      expect(validMin.success).toBe(true);

      const validMax = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        overallRiskScore: 10,
        suggestedFocusAreas: [],
      });
      expect(validMax.success).toBe(true);

      const tooHigh = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        overallRiskScore: 15,
        suggestedFocusAreas: [],
      });
      expect(tooHigh.success).toBe(false);

      const tooLow = FileHeatmapSchema.safeParse({
        lines: [],
        fileSummary: "Summary",
        overallRiskScore: -1,
        suggestedFocusAreas: [],
      });
      expect(tooLow.success).toBe(false);
    });

    it("validates nested lines schema", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [
          { line: "code", lineNumber: 1, hasChanged: true, shouldBeReviewedScore: 15 }, // Invalid score
        ],
        fileSummary: "Summary",
        overallRiskScore: 5,
        suggestedFocusAreas: [],
      });
      expect(result.success).toBe(false);
    });

    it("accepts multiple lines with all fields", () => {
      const result = FileHeatmapSchema.safeParse({
        lines: [
          { line: "import x from 'y';", lineNumber: 1, hasChanged: false },
          { line: "const result = process(x);", lineNumber: 2, hasChanged: true, shouldBeReviewedScore: 9, shouldReviewWhy: "New processing logic" },
          { line: "export { result };", lineNumber: 3, hasChanged: false },
        ],
        fileSummary: "Added new data processing",
        overallRiskScore: 7,
        suggestedFocusAreas: ["process function", "data validation"],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.lines).toHaveLength(3);
      }
    });
  });
});
