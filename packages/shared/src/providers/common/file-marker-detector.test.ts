import { describe, expect, it } from "vitest";
import type { FileMarkerDetectorOptions } from "./file-marker-detector";

describe("createFileMarkerDetector", () => {
  it("exports the function", async () => {
    const mod = await import("./file-marker-detector");
    expect(typeof mod.createFileMarkerDetector).toBe("function");
  });

  it("options type is correctly shaped", () => {
    // Type check - verify the options interface is exported and usable
    const options: FileMarkerDetectorOptions = {
      markerPath: "/tmp/test/done.txt",
      watchDir: "/tmp/test",
      markerFilename: "done.txt",
      onComplete: () => {},
    };

    // All required properties should be present
    expect(options.markerPath).toBe("/tmp/test/done.txt");
    expect(options.watchDir).toBe("/tmp/test");
    expect(options.markerFilename).toBe("done.txt");
    expect(typeof options.onComplete).toBe("function");
  });
});
