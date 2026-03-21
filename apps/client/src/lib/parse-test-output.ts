/**
 * Test output parsing utilities for vitest, jest, and go test formats.
 */

export type TestStatus = "pass" | "fail" | "skip" | "unknown";

export interface ParsedTestResult {
  framework: "vitest" | "jest" | "go" | "unknown";
  summary: {
    total: number;
    passed: number;
    failed: number;
    skipped: number;
  };
  tests: ParsedTest[];
  duration?: number;
  raw: string;
}

export interface ParsedTest {
  name: string;
  status: TestStatus;
  duration?: number;
  file?: string;
  error?: string;
}

/**
 * Detects if output looks like test output and parses it.
 * Returns null if not test output.
 */
export function parseTestOutput(output: string): ParsedTestResult | null {
  if (!output || typeof output !== "string") {
    return null;
  }

  // Try each parser in order
  const vitestResult = parseVitestOutput(output);
  if (vitestResult) return vitestResult;

  const jestResult = parseJestOutput(output);
  if (jestResult) return jestResult;

  const goResult = parseGoTestOutput(output);
  if (goResult) return goResult;

  return null;
}

/**
 * Parse vitest output format.
 * Example: "Test Files  2 passed | 1 failed (3)" or "Tests  5 passed | 2 failed (7)"
 */
function parseVitestOutput(output: string): ParsedTestResult | null {
  // Match vitest summary line
  const summaryMatch = output.match(
    /(?:Test Files|Tests)\s+(\d+)\s+passed(?:\s*\|\s*(\d+)\s+failed)?(?:\s*\|\s*(\d+)\s+skipped)?/i
  );

  if (!summaryMatch) {
    // Also check for "x tests passed" format
    const altMatch = output.match(/(\d+)\s+tests?\s+passed/i);
    if (!altMatch) return null;

    const passed = parseInt(altMatch[1], 10);
    const failedMatch = output.match(/(\d+)\s+tests?\s+failed/i);
    const failed = failedMatch ? parseInt(failedMatch[1], 10) : 0;

    return {
      framework: "vitest",
      summary: {
        total: passed + failed,
        passed,
        failed,
        skipped: 0,
      },
      tests: [],
      raw: output,
    };
  }

  const passed = parseInt(summaryMatch[1], 10);
  const failed = summaryMatch[2] ? parseInt(summaryMatch[2], 10) : 0;
  const skipped = summaryMatch[3] ? parseInt(summaryMatch[3], 10) : 0;

  // Parse individual test results
  const tests: ParsedTest[] = [];
  const testPattern = /([✓✗])\s+(.+?)(?:\s+\((\d+)ms\))?$/gm;
  let match;
  while ((match = testPattern.exec(output)) !== null) {
    tests.push({
      name: match[2].trim(),
      status: match[1] === "✓" ? "pass" : "fail",
      duration: match[3] ? parseInt(match[3], 10) : undefined,
    });
  }

  // Parse duration
  const durationMatch = output.match(/Duration\s+(\d+(?:\.\d+)?)\s*(s|ms)/i);
  let duration: number | undefined;
  if (durationMatch) {
    const value = parseFloat(durationMatch[1]);
    duration = durationMatch[2] === "s" ? value * 1000 : value;
  }

  return {
    framework: "vitest",
    summary: {
      total: passed + failed + skipped,
      passed,
      failed,
      skipped,
    },
    tests,
    duration,
    raw: output,
  };
}

/**
 * Parse jest output format.
 * Example: "Test Suites: 2 passed, 1 failed, 3 total"
 */
function parseJestOutput(output: string): ParsedTestResult | null {
  const suiteMatch = output.match(
    /Test Suites:\s*(?:(\d+)\s+passed)?(?:,\s*)?(?:(\d+)\s+failed)?(?:,\s*)?(?:(\d+)\s+skipped)?(?:,\s*)?(\d+)\s+total/i
  );

  if (!suiteMatch) return null;

  const passed = suiteMatch[1] ? parseInt(suiteMatch[1], 10) : 0;
  const failed = suiteMatch[2] ? parseInt(suiteMatch[2], 10) : 0;
  const skipped = suiteMatch[3] ? parseInt(suiteMatch[3], 10) : 0;
  const total = parseInt(suiteMatch[4], 10);

  // Parse individual test results
  const tests: ParsedTest[] = [];
  const passPattern = /✓\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;
  const failPattern = /✕\s+(.+?)(?:\s+\((\d+)\s*ms\))?$/gm;

  let match;
  while ((match = passPattern.exec(output)) !== null) {
    tests.push({
      name: match[1].trim(),
      status: "pass",
      duration: match[2] ? parseInt(match[2], 10) : undefined,
    });
  }
  while ((match = failPattern.exec(output)) !== null) {
    tests.push({
      name: match[1].trim(),
      status: "fail",
      duration: match[2] ? parseInt(match[2], 10) : undefined,
    });
  }

  // Parse total duration
  const durationMatch = output.match(/Time:\s*(\d+(?:\.\d+)?)\s*(s|ms)/i);
  let duration: number | undefined;
  if (durationMatch) {
    const value = parseFloat(durationMatch[1]);
    duration = durationMatch[2] === "s" ? value * 1000 : value;
  }

  return {
    framework: "jest",
    summary: {
      total,
      passed,
      failed,
      skipped,
    },
    tests,
    duration,
    raw: output,
  };
}

/**
 * Parse go test output format.
 * Example: "--- PASS: TestFoo (0.00s)" or "PASS" / "FAIL"
 */
function parseGoTestOutput(output: string): ParsedTestResult | null {
  // Check for go test markers
  const hasGoTestOutput =
    output.includes("--- PASS:") ||
    output.includes("--- FAIL:") ||
    output.includes("--- SKIP:") ||
    /^(ok|FAIL)\s+\S+/m.test(output);

  if (!hasGoTestOutput) return null;

  const tests: ParsedTest[] = [];

  // Parse individual test results
  const testPattern = /---\s+(PASS|FAIL|SKIP):\s+(\S+)\s+\((\d+(?:\.\d+)?)s\)/g;
  let match;
  while ((match = testPattern.exec(output)) !== null) {
    const statusMap: Record<string, TestStatus> = {
      PASS: "pass",
      FAIL: "fail",
      SKIP: "skip",
    };
    tests.push({
      name: match[2],
      status: statusMap[match[1]] ?? "unknown",
      duration: parseFloat(match[3]) * 1000,
    });
  }

  const passed = tests.filter((t) => t.status === "pass").length;
  const failed = tests.filter((t) => t.status === "fail").length;
  const skipped = tests.filter((t) => t.status === "skip").length;

  // Parse total duration from package summary
  const durationMatch = output.match(
    /(?:ok|FAIL)\s+\S+\s+(\d+(?:\.\d+)?)s/
  );
  let duration: number | undefined;
  if (durationMatch) {
    duration = parseFloat(durationMatch[1]) * 1000;
  }

  return {
    framework: "go",
    summary: {
      total: tests.length,
      passed,
      failed,
      skipped,
    },
    tests,
    duration,
    raw: output,
  };
}

/**
 * Quick check if a bash command output looks like it might contain test results.
 * Used to filter activity before full parsing.
 */
export function looksLikeTestOutput(output: string): boolean {
  if (!output || typeof output !== "string") return false;

  const testIndicators = [
    // vitest/jest
    /test(?:s|ing)?/i,
    /pass(?:ed|ing)?/i,
    /fail(?:ed|ing)?/i,
    /✓|✗|✕/,
    /Test (?:Files|Suites)/i,
    // go test
    /---\s+(?:PASS|FAIL|SKIP):/,
    /^(?:ok|FAIL)\s+\S+/m,
    // bun test
    /bun test/i,
    // generic
    /\d+\s+(?:passed|failed)/i,
  ];

  return testIndicators.some((pattern) => pattern.test(output));
}
