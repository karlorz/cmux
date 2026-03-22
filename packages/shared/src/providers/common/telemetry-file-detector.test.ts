import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { createTelemetryFileDetector } from "./telemetry-file-detector";
import * as fsp from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("createTelemetryFileDetector", () => {
  let testDir: string;
  let telemetryPath: string;

  beforeEach(async () => {
    testDir = join(tmpdir(), `telemetry-test-${Date.now()}`);
    await fsp.mkdir(testDir, { recursive: true });
    telemetryPath = join(testDir, "telemetry.jsonl");
  });

  afterEach(async () => {
    try {
      await fsp.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  it("returns a Promise", () => {
    const result = createTelemetryFileDetector({
      telemetryPath,
      isCompletionEvent: () => false,
    });
    expect(result).toBeInstanceOf(Promise);
  });

  it("resolves when completion event is detected", async () => {
    // Create telemetry file with completion event
    const events = [
      JSON.stringify({ type: "start" }),
      JSON.stringify({ type: "complete" }),
    ].join("\n");

    await fsp.writeFile(telemetryPath, events);

    const promise = createTelemetryFileDetector({
      telemetryPath,
      isCompletionEvent: (event) => {
        const e = event as { type?: string };
        return e.type === "complete";
      },
    });

    await promise;
    // If we get here, the detector resolved successfully
    expect(true).toBe(true);
  });

  it("detects completion events in streamed data", async () => {
    // Start with non-completion events
    await fsp.writeFile(
      telemetryPath,
      JSON.stringify({ type: "start" }) + "\n"
    );

    const promise = createTelemetryFileDetector({
      telemetryPath,
      isCompletionEvent: (event) => {
        const e = event as { type?: string };
        return e.type === "complete";
      },
    });

    // Small delay to ensure watcher is set up
    await new Promise((r) => setTimeout(r, 50));

    // Append completion event
    await fsp.appendFile(
      telemetryPath,
      JSON.stringify({ type: "complete" }) + "\n"
    );

    await promise;
    expect(true).toBe(true);
  });

  it("ignores non-completion events", async () => {
    let completionCalls = 0;

    await fsp.writeFile(telemetryPath, "");

    const promise = createTelemetryFileDetector({
      telemetryPath,
      isCompletionEvent: (event) => {
        const e = event as { type?: string };
        if (e.type === "complete") {
          completionCalls++;
          return true;
        }
        return false;
      },
    });

    // Small delay
    await new Promise((r) => setTimeout(r, 50));

    // Write multiple non-completion events
    await fsp.appendFile(
      telemetryPath,
      JSON.stringify({ type: "progress" }) + "\n"
    );
    await fsp.appendFile(
      telemetryPath,
      JSON.stringify({ type: "progress" }) + "\n"
    );

    // Small delay
    await new Promise((r) => setTimeout(r, 50));

    // Now complete
    await fsp.appendFile(
      telemetryPath,
      JSON.stringify({ type: "complete" }) + "\n"
    );

    await promise;
    expect(completionCalls).toBe(1);
  });
});
