import { describe, expect, it } from "vitest";
import type { DiffStatus, ReplaceDiffEntry } from "./diff-types";

describe("DiffStatus type", () => {
  it("accepts valid status values", () => {
    const statuses: DiffStatus[] = ["added", "modified", "deleted", "renamed"];
    expect(statuses).toHaveLength(4);
  });
});

describe("ReplaceDiffEntry interface", () => {
  it("accepts minimal valid entry", () => {
    const entry: ReplaceDiffEntry = {
      filePath: "src/test.ts",
      status: "added",
      additions: 10,
      deletions: 0,
      isBinary: false,
    };
    expect(entry.filePath).toBe("src/test.ts");
    expect(entry.status).toBe("added");
  });

  it("accepts entry with all optional fields", () => {
    const entry: ReplaceDiffEntry = {
      filePath: "src/renamed.ts",
      oldPath: "src/old-name.ts",
      status: "renamed",
      additions: 5,
      deletions: 3,
      patch: "@@ -1,3 +1,5 @@",
      oldContent: "old content",
      newContent: "new content",
      isBinary: false,
      contentOmitted: false,
      oldSize: 100,
      newSize: 150,
      patchSize: 50,
    };
    expect(entry.oldPath).toBe("src/old-name.ts");
    expect(entry.status).toBe("renamed");
  });

  it("accepts binary file entry", () => {
    const entry: ReplaceDiffEntry = {
      filePath: "image.png",
      status: "added",
      additions: 0,
      deletions: 0,
      isBinary: true,
    };
    expect(entry.isBinary).toBe(true);
    expect(entry.patch).toBeUndefined();
  });

  it("accepts deleted file entry", () => {
    const entry: ReplaceDiffEntry = {
      filePath: "removed.ts",
      status: "deleted",
      additions: 0,
      deletions: 50,
      isBinary: false,
    };
    expect(entry.status).toBe("deleted");
    expect(entry.deletions).toBe(50);
  });

  it("accepts modified file entry", () => {
    const entry: ReplaceDiffEntry = {
      filePath: "src/modified.ts",
      status: "modified",
      additions: 10,
      deletions: 5,
      patch: "@@...",
      isBinary: false,
    };
    expect(entry.status).toBe("modified");
    expect(entry.additions).toBe(10);
  });
});
