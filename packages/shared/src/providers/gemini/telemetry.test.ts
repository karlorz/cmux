import { describe, expect, it } from "vitest";
import {
  GEMINI_TELEMETRY_OUTFILE_TEMPLATE,
  getGeminiTelemetryPath,
} from "./telemetry";

describe("GEMINI_TELEMETRY_OUTFILE_TEMPLATE", () => {
  it("contains task run ID placeholder", () => {
    expect(GEMINI_TELEMETRY_OUTFILE_TEMPLATE).toContain("$CMUX_TASK_RUN_ID");
  });

  it("is in /tmp directory", () => {
    expect(GEMINI_TELEMETRY_OUTFILE_TEMPLATE).toMatch(/^\/tmp\//);
  });

  it("has .log extension", () => {
    expect(GEMINI_TELEMETRY_OUTFILE_TEMPLATE).toMatch(/\.log$/);
  });
});

describe("getGeminiTelemetryPath", () => {
  it("returns path with task run ID substituted", () => {
    const taskRunId = "task_abc123";
    const result = getGeminiTelemetryPath(taskRunId);
    expect(result).toBe("/tmp/gemini-telemetry-task_abc123.log");
  });

  it("returns path in /tmp directory", () => {
    const result = getGeminiTelemetryPath("any-id");
    expect(result).toMatch(/^\/tmp\//);
  });

  it("includes gemini-telemetry prefix", () => {
    const result = getGeminiTelemetryPath("test");
    expect(result).toContain("gemini-telemetry");
  });

  it("handles empty task run ID", () => {
    const result = getGeminiTelemetryPath("");
    expect(result).toBe("/tmp/gemini-telemetry-.log");
  });
});
