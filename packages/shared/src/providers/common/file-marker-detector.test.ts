import { describe, expect, it } from "vitest";
import { createFileMarkerDetector } from "./file-marker-detector";

describe("createFileMarkerDetector", () => {
  it("returns a Promise", () => {
    // Use a path that doesn't exist - the detector handles this gracefully
    const result = createFileMarkerDetector({
      markerPath: "/tmp/nonexistent-marker-test/done.txt",
      watchDir: "/tmp/nonexistent-marker-test",
      markerFilename: "done.txt",
    });
    expect(result).toBeInstanceOf(Promise);
  });

  it("accepts valid options", () => {
    // Just verify the function accepts the expected options shape
    const options = {
      markerPath: "/some/path/done.txt",
      watchDir: "/some/path",
      markerFilename: "done.txt",
      onComplete: () => {},
    };

    // Should not throw when called with valid options
    expect(() => createFileMarkerDetector(options)).not.toThrow();
  });

  it("exports FileMarkerDetectorOptions type", async () => {
    // Type check - this test verifies the module exports correctly
    const mod = await import("./file-marker-detector");
    expect(typeof mod.createFileMarkerDetector).toBe("function");
  });
});
