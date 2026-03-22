import { describe, expect, it } from "vitest";
import { parseTestOutput, looksLikeTestOutput } from "./parse-test-output";

describe("parse-test-output", () => {
  describe("parseTestOutput", () => {
    describe("null/invalid input", () => {
      it("returns null for empty string", () => {
        expect(parseTestOutput("")).toBeNull();
      });

      it("returns null for non-test output", () => {
        expect(parseTestOutput("hello world")).toBeNull();
        expect(parseTestOutput("npm install completed")).toBeNull();
      });

      it("returns null for null/undefined input", () => {
        expect(parseTestOutput(null as unknown as string)).toBeNull();
        expect(parseTestOutput(undefined as unknown as string)).toBeNull();
      });
    });

    describe("vitest output", () => {
      it("parses basic vitest summary", () => {
        const output = "Test Files  2 passed (2)";
        const result = parseTestOutput(output);
        expect(result).not.toBeNull();
        expect(result?.framework).toBe("vitest");
        expect(result?.summary).toEqual({
          total: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
        });
      });

      it("parses vitest with failures", () => {
        const output = "Test Files  3 passed | 2 failed (5)";
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("vitest");
        expect(result?.summary).toEqual({
          total: 5,
          passed: 3,
          failed: 2,
          skipped: 0,
        });
      });

      it("parses vitest with skipped tests", () => {
        const output = "Tests  5 passed | 1 failed | 2 skipped (8)";
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("vitest");
        expect(result?.summary).toEqual({
          total: 8,
          passed: 5,
          failed: 1,
          skipped: 2,
        });
      });

      it("parses alternative vitest format", () => {
        const output = "15 tests passed";
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("vitest");
        expect(result?.summary.passed).toBe(15);
        expect(result?.summary.total).toBe(15);
      });

      it("parses vitest individual test lines", () => {
        const output = `
 ✓ should handle empty input
 ✓ should parse valid data (25ms)
 ✗ should fail gracefully (10ms)
Test Files  2 passed | 1 failed (3)
        `;
        const result = parseTestOutput(output);
        expect(result?.tests).toHaveLength(3);
        expect(result?.tests[0]).toEqual({
          name: "should handle empty input",
          status: "pass",
          duration: undefined,
        });
        expect(result?.tests[1]).toEqual({
          name: "should parse valid data",
          status: "pass",
          duration: 25,
        });
        expect(result?.tests[2]).toEqual({
          name: "should fail gracefully",
          status: "fail",
          duration: 10,
        });
      });

      it("parses vitest duration in seconds", () => {
        const output = "Test Files  1 passed (1)\nDuration  5.2s";
        const result = parseTestOutput(output);
        expect(result?.duration).toBe(5200);
      });

      it("parses vitest duration in milliseconds", () => {
        const output = "Test Files  1 passed (1)\nDuration  250ms";
        const result = parseTestOutput(output);
        expect(result?.duration).toBe(250);
      });
    });

    describe("jest output", () => {
      it("parses basic jest summary", () => {
        const output = "Test Suites: 3 passed, 3 total";
        const result = parseTestOutput(output);
        expect(result).not.toBeNull();
        expect(result?.framework).toBe("jest");
        expect(result?.summary).toEqual({
          total: 3,
          passed: 3,
          failed: 0,
          skipped: 0,
        });
      });

      it("parses jest with failures", () => {
        const output = "Test Suites: 2 passed, 1 failed, 3 total";
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("jest");
        expect(result?.summary).toEqual({
          total: 3,
          passed: 2,
          failed: 1,
          skipped: 0,
        });
      });

      it("parses jest with skipped", () => {
        const output = "Test Suites: 2 passed, 1 failed, 2 skipped, 5 total";
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("jest");
        expect(result?.summary).toEqual({
          total: 5,
          passed: 2,
          failed: 1,
          skipped: 2,
        });
      });

      it("parses jest individual test lines", () => {
        const output = `
  ✓ handles edge cases (5 ms)
  ✕ throws on invalid input (12 ms)
Test Suites: 1 passed, 1 failed, 2 total
        `;
        const result = parseTestOutput(output);
        expect(result?.tests).toHaveLength(2);
        expect(result?.tests[0]).toEqual({
          name: "handles edge cases",
          status: "pass",
          duration: 5,
        });
        expect(result?.tests[1]).toEqual({
          name: "throws on invalid input",
          status: "fail",
          duration: 12,
        });
      });

      it("parses jest duration", () => {
        const output = "Test Suites: 1 passed, 1 total\nTime: 2.5s";
        const result = parseTestOutput(output);
        expect(result?.duration).toBe(2500);
      });
    });

    describe("go test output", () => {
      it("parses basic go test pass", () => {
        const output = `--- PASS: TestFoo (0.01s)
--- PASS: TestBar (0.02s)
ok  	example.com/pkg	0.05s`;
        const result = parseTestOutput(output);
        expect(result).not.toBeNull();
        expect(result?.framework).toBe("go");
        expect(result?.summary).toEqual({
          total: 2,
          passed: 2,
          failed: 0,
          skipped: 0,
        });
      });

      it("parses go test with failures", () => {
        const output = `--- PASS: TestOk (0.01s)
--- FAIL: TestBroken (0.05s)
FAIL	example.com/pkg	0.10s`;
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("go");
        expect(result?.summary).toEqual({
          total: 2,
          passed: 1,
          failed: 1,
          skipped: 0,
        });
      });

      it("parses go test with skipped", () => {
        const output = `--- PASS: TestA (0.01s)
--- SKIP: TestB (0.00s)
ok  	example.com/pkg	0.02s`;
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("go");
        expect(result?.summary).toEqual({
          total: 2,
          passed: 1,
          failed: 0,
          skipped: 1,
        });
      });

      it("parses go test individual results", () => {
        const output = `--- PASS: TestOne (0.123s)
--- FAIL: TestTwo (0.456s)
FAIL	example.com/pkg	1.00s`;
        const result = parseTestOutput(output);
        expect(result?.tests).toHaveLength(2);
        expect(result?.tests[0]).toEqual({
          name: "TestOne",
          status: "pass",
          duration: 123,
        });
        expect(result?.tests[1]).toEqual({
          name: "TestTwo",
          status: "fail",
          duration: 456,
        });
      });

      it("parses go test duration from package summary", () => {
        const output = `--- PASS: TestFoo (0.01s)
ok  	example.com/pkg	2.5s`;
        const result = parseTestOutput(output);
        expect(result?.duration).toBe(2500);
      });

      it("detects go test from FAIL package line", () => {
        const output = `FAIL	example.com/broken	0.5s`;
        const result = parseTestOutput(output);
        expect(result?.framework).toBe("go");
      });
    });

    describe("framework detection priority", () => {
      it("returns first matching framework", () => {
        // If output matches vitest, it should return vitest even if it could match others
        const vitestOutput = "Test Files  1 passed (1)";
        expect(parseTestOutput(vitestOutput)?.framework).toBe("vitest");
      });
    });

    describe("raw output preservation", () => {
      it("preserves raw output in result", () => {
        const output = "Test Files  1 passed (1)";
        const result = parseTestOutput(output);
        expect(result?.raw).toBe(output);
      });
    });
  });

  describe("looksLikeTestOutput", () => {
    it("returns false for empty input", () => {
      expect(looksLikeTestOutput("")).toBe(false);
    });

    it("returns false for null/undefined", () => {
      expect(looksLikeTestOutput(null as unknown as string)).toBe(false);
      expect(looksLikeTestOutput(undefined as unknown as string)).toBe(false);
    });

    it("returns false for regular output", () => {
      expect(looksLikeTestOutput("npm install completed")).toBe(false);
      expect(looksLikeTestOutput("Starting server on port 3000")).toBe(false);
    });

    it("detects test-related keywords", () => {
      expect(looksLikeTestOutput("Running tests...")).toBe(true);
      expect(looksLikeTestOutput("5 passed")).toBe(true);
      expect(looksLikeTestOutput("2 failed")).toBe(true);
    });

    it("detects vitest/jest checkmarks", () => {
      expect(looksLikeTestOutput("✓ should work")).toBe(true);
      expect(looksLikeTestOutput("✗ should fail")).toBe(true);
      expect(looksLikeTestOutput("✕ broken test")).toBe(true);
    });

    it("detects Test Files/Suites keywords", () => {
      expect(looksLikeTestOutput("Test Files  1 passed")).toBe(true);
      expect(looksLikeTestOutput("Test Suites: 2 passed")).toBe(true);
    });

    it("detects go test markers", () => {
      expect(looksLikeTestOutput("--- PASS: TestFoo")).toBe(true);
      expect(looksLikeTestOutput("--- FAIL: TestBar")).toBe(true);
      expect(looksLikeTestOutput("--- SKIP: TestBaz")).toBe(true);
      expect(looksLikeTestOutput("ok  	example.com/pkg")).toBe(true);
      expect(looksLikeTestOutput("FAIL	example.com/pkg")).toBe(true);
    });

    it("detects bun test", () => {
      expect(looksLikeTestOutput("bun test v1.0")).toBe(true);
    });

    it("detects generic passed/failed patterns", () => {
      expect(looksLikeTestOutput("10 passed")).toBe(true);
      expect(looksLikeTestOutput("3 failed")).toBe(true);
    });
  });
});
