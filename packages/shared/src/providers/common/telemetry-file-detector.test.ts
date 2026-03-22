import { describe, expect, it } from "vitest";
import type { TelemetryFileDetectorOptions } from "./telemetry-file-detector";

describe("createTelemetryFileDetector", () => {
  it("exports the function", async () => {
    const mod = await import("./telemetry-file-detector");
    expect(typeof mod.createTelemetryFileDetector).toBe("function");
  });

  it("options type is correctly shaped", () => {
    // Type check - verify the options interface is exported and usable
    const options: TelemetryFileDetectorOptions = {
      telemetryPath: "/tmp/test/telemetry.jsonl",
      isCompletionEvent: (event) => {
        const e = event as { type?: string };
        return e.type === "complete";
      },
    };

    expect(options.telemetryPath).toBe("/tmp/test/telemetry.jsonl");
    expect(typeof options.isCompletionEvent).toBe("function");
  });

  it("isCompletionEvent callback receives events", () => {
    const events: unknown[] = [];
    const options: TelemetryFileDetectorOptions = {
      telemetryPath: "/tmp/test/telemetry.jsonl",
      isCompletionEvent: (event) => {
        events.push(event);
        return false;
      },
    };

    // Verify the callback can be invoked
    options.isCompletionEvent({ type: "test" });
    expect(events.length).toBe(1);
    expect(events[0]).toEqual({ type: "test" });
  });
});
