import { describe, expect, it } from "vitest";
import {
  parseAcceptLanguage,
  buildHeatmapPrompt,
  summarizeHeatmapStreamChunk,
  heatmapSchema,
} from "./heatmap-shared";

describe("parseAcceptLanguage", () => {
  describe("valid Accept-Language headers", () => {
    it("parses simple language code", () => {
      expect(parseAcceptLanguage("en")).toBe("en");
    });

    it("parses language with region", () => {
      expect(parseAcceptLanguage("en-US")).toBe("en-US");
    });

    it("parses first language from multiple", () => {
      expect(parseAcceptLanguage("en-US,en;q=0.9,ja;q=0.8")).toBe("en-US");
    });

    it("strips quality factor", () => {
      expect(parseAcceptLanguage("ja;q=0.9")).toBe("ja");
    });

    it("handles zh-Hans (Simplified Chinese)", () => {
      expect(parseAcceptLanguage("zh-Hans")).toBe("zh-Hans");
    });

    it("handles zh-Hant (Traditional Chinese)", () => {
      expect(parseAcceptLanguage("zh-Hant")).toBe("zh-Hant");
    });

    it("handles three-letter codes", () => {
      expect(parseAcceptLanguage("fil")).toBe("fil");
    });
  });

  describe("invalid inputs", () => {
    it("returns null for null", () => {
      expect(parseAcceptLanguage(null)).toBeNull();
    });

    it("returns null for undefined", () => {
      expect(parseAcceptLanguage(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(parseAcceptLanguage("")).toBeNull();
    });

    it("returns null for invalid format", () => {
      expect(parseAcceptLanguage("123")).toBeNull();
    });

    it("returns null for single char", () => {
      expect(parseAcceptLanguage("e")).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("handles whitespace", () => {
      expect(parseAcceptLanguage(" en-US ")).toBe("en-US");
    });

    it("handles comma with no content after", () => {
      expect(parseAcceptLanguage("en,")).toBe("en");
    });
  });
});

describe("buildHeatmapPrompt", () => {
  it("includes file path", () => {
    const prompt = buildHeatmapPrompt("src/test.ts", ["+added line"]);
    expect(prompt).toContain('"src/test.ts"');
  });

  it("includes diff content", () => {
    const lines = ["+const x = 1;", "-const y = 2;"];
    const prompt = buildHeatmapPrompt("test.ts", lines);
    expect(prompt).toContain("+const x = 1;");
    expect(prompt).toContain("-const y = 2;");
  });

  it("handles empty diff", () => {
    const prompt = buildHeatmapPrompt("test.ts", []);
    expect(prompt).toContain("(no diff)");
  });

  it("includes language instruction for non-English", () => {
    const prompt = buildHeatmapPrompt("test.ts", ["+code"], "ja");
    expect(prompt).toContain("Japanese");
    expect(prompt).toContain("IMPORTANT");
  });

  it("excludes language instruction for English", () => {
    const prompt = buildHeatmapPrompt("test.ts", ["+code"], "en");
    expect(prompt).not.toContain("IMPORTANT: Write ALL");
  });
});

describe("summarizeHeatmapStreamChunk", () => {
  describe("text-delta chunks", () => {
    it("extracts textDelta from text-delta type", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "text-delta",
        textDelta: "some text",
      });
      expect(result.textDelta).toBe("some text");
      expect(result.lineCount).toBeNull();
    });

    it("returns null textDelta for empty string", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "text-delta",
        textDelta: "   ",
      });
      expect(result.textDelta).toBeNull();
    });

    it("trims textDelta", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "text-delta",
        textDelta: "  hello  ",
      });
      expect(result.textDelta).toBe("hello");
    });
  });

  describe("object chunks", () => {
    it("extracts lineCount from valid heatmap object", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "object",
        object: {
          lines: [
            { line: "+code", mostImportantWord: "code" },
            { line: "-old", mostImportantWord: "old" },
          ],
        },
      });
      expect(result.lineCount).toBe(2);
      expect(result.textDelta).toBeNull();
    });

    it("returns null lineCount for invalid lines", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "object",
        object: {
          lines: [{ invalid: "data" }],
        },
      });
      expect(result.lineCount).toBeNull();
    });

    it("validates shouldBeReviewedScore range", () => {
      const validResult = summarizeHeatmapStreamChunk({
        type: "object",
        object: {
          lines: [
            { line: "+x", mostImportantWord: "x", shouldBeReviewedScore: 0.5 },
          ],
        },
      });
      expect(validResult.lineCount).toBe(1);

      const invalidResult = summarizeHeatmapStreamChunk({
        type: "object",
        object: {
          lines: [
            { line: "+x", mostImportantWord: "x", shouldBeReviewedScore: 1.5 },
          ],
        },
      });
      expect(invalidResult.lineCount).toBeNull();
    });
  });

  describe("invalid inputs", () => {
    it("handles non-object input", () => {
      expect(summarizeHeatmapStreamChunk("string")).toEqual({
        lineCount: null,
        textDelta: null,
      });
      expect(summarizeHeatmapStreamChunk(null)).toEqual({
        lineCount: null,
        textDelta: null,
      });
    });

    it("handles unknown type", () => {
      const result = summarizeHeatmapStreamChunk({
        type: "unknown",
        data: "test",
      });
      expect(result).toEqual({ lineCount: null, textDelta: null });
    });
  });
});

describe("heatmapSchema", () => {
  it("validates valid heatmap", () => {
    const valid = {
      lines: [
        { line: "+code", mostImportantWord: "code" },
        {
          line: "-old",
          mostImportantWord: "old",
          shouldBeReviewedScore: 0.8,
          shouldReviewWhy: "important change",
        },
      ],
    };
    expect(heatmapSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects invalid score range", () => {
    const invalid = {
      lines: [{ line: "+code", mostImportantWord: "code", shouldBeReviewedScore: 2 }],
    };
    expect(heatmapSchema.safeParse(invalid).success).toBe(false);
  });

  it("rejects empty mostImportantWord", () => {
    const invalid = {
      lines: [{ line: "+code", mostImportantWord: "" }],
    };
    expect(heatmapSchema.safeParse(invalid).success).toBe(false);
  });
});
