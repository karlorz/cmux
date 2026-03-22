import { describe, expect, it } from "vitest";
import { toGithubFileChange, type GithubPullRequestFile } from "./fetch-pull-request";

// Helper to create a minimal valid GitHub file object
function createFile(
  overrides: Partial<GithubPullRequestFile> & Pick<GithubPullRequestFile, "filename" | "status">
): GithubPullRequestFile {
  return {
    sha: "abc123",
    filename: overrides.filename,
    status: overrides.status,
    additions: overrides.additions ?? 0,
    deletions: overrides.deletions ?? 0,
    changes: overrides.changes ?? 0,
    blob_url: `https://github.com/owner/repo/blob/abc123/${overrides.filename}`,
    raw_url: `https://github.com/owner/repo/raw/abc123/${overrides.filename}`,
    contents_url: `https://api.github.com/repos/owner/repo/contents/${overrides.filename}`,
    patch: overrides.patch,
    previous_filename: overrides.previous_filename,
  };
}

describe("fetch-pull-request", () => {
  describe("toGithubFileChange", () => {
    it("converts file with all fields", () => {
      const file = createFile({
        filename: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 5,
        changes: 15,
        patch: "@@ -1,5 +1,10 @@\n...",
      });

      const result = toGithubFileChange(file);

      expect(result).toEqual({
        filename: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 5,
        changes: 15,
        previous_filename: undefined,
        patch: "@@ -1,5 +1,10 @@\n...",
      });
    });

    it("converts renamed file with previous_filename", () => {
      const file = createFile({
        filename: "src/new-name.ts",
        status: "renamed",
        additions: 2,
        deletions: 1,
        changes: 3,
        previous_filename: "src/old-name.ts",
        patch: "@@ -1,3 +1,4 @@\n...",
      });

      const result = toGithubFileChange(file);

      expect(result.filename).toBe("src/new-name.ts");
      expect(result.previous_filename).toBe("src/old-name.ts");
      expect(result.status).toBe("renamed");
    });

    it("converts added file", () => {
      const file = createFile({
        filename: "src/new-file.ts",
        status: "added",
        additions: 50,
        deletions: 0,
        changes: 50,
        patch: "@@ -0,0 +1,50 @@\n...",
      });

      const result = toGithubFileChange(file);

      expect(result.status).toBe("added");
      expect(result.deletions).toBe(0);
      expect(result.additions).toBe(50);
    });

    it("converts deleted file", () => {
      const file = createFile({
        filename: "src/removed-file.ts",
        status: "removed",
        additions: 0,
        deletions: 100,
        changes: 100,
      });

      const result = toGithubFileChange(file);

      expect(result.status).toBe("removed");
      expect(result.additions).toBe(0);
      expect(result.patch).toBeUndefined();
    });

    it("handles file without patch (binary)", () => {
      const file = createFile({
        filename: "binary-file.png",
        status: "modified",
        additions: 0,
        deletions: 0,
        changes: 0,
      });

      const result = toGithubFileChange(file);

      expect(result.patch).toBeUndefined();
      expect(result.changes).toBe(0);
    });

    it("handles file with zero changes", () => {
      const file = createFile({
        filename: "unchanged.txt",
        status: "modified",
        additions: 0,
        deletions: 0,
        changes: 0,
        patch: "",
      });

      const result = toGithubFileChange(file);

      expect(result.additions).toBe(0);
      expect(result.deletions).toBe(0);
      expect(result.changes).toBe(0);
    });

    it("preserves copied status", () => {
      const file = createFile({
        filename: "src/copied-file.ts",
        status: "copied",
        additions: 0,
        deletions: 0,
        changes: 0,
        previous_filename: "src/original-file.ts",
      });

      const result = toGithubFileChange(file);

      expect(result.status).toBe("copied");
      expect(result.previous_filename).toBe("src/original-file.ts");
    });

    it("preserves unchanged status", () => {
      const file = createFile({
        filename: "src/unchanged.ts",
        status: "unchanged",
        additions: 0,
        deletions: 0,
        changes: 0,
      });

      const result = toGithubFileChange(file);

      expect(result.status).toBe("unchanged");
    });

    it("strips extra fields not in output type", () => {
      const file = createFile({
        filename: "src/file.ts",
        status: "modified",
        additions: 1,
        deletions: 1,
        changes: 2,
      });

      const result = toGithubFileChange(file);

      // Result should not contain sha, blob_url, raw_url, contents_url
      expect(Object.keys(result).sort()).toEqual([
        "additions",
        "changes",
        "deletions",
        "filename",
        "patch",
        "previous_filename",
        "status",
      ]);
    });
  });
});
