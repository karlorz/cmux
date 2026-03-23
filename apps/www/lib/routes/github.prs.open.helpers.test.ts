import { describe, expect, it } from "vitest";
import {
  splitRepoFullName,
  buildMergeCommitInfo,
  emptyAggregate,
  buildPrDescription,
} from "./github.prs.open.helpers";

describe("github.prs.open.helpers", () => {
  describe("splitRepoFullName", () => {
    it("splits valid owner/repo format", () => {
      const result = splitRepoFullName("octocat/hello-world");
      expect(result).toEqual({ owner: "octocat", repo: "hello-world" });
    });

    it("handles owner with numbers and hyphens", () => {
      const result = splitRepoFullName("user-123/my-repo");
      expect(result).toEqual({ owner: "user-123", repo: "my-repo" });
    });

    it("returns null for invalid format without slash", () => {
      expect(splitRepoFullName("noslash")).toBeNull();
    });

    it("returns null for empty string", () => {
      expect(splitRepoFullName("")).toBeNull();
    });

    it("returns null for just a slash", () => {
      expect(splitRepoFullName("/")).toBeNull();
    });

    it("returns null for missing owner", () => {
      expect(splitRepoFullName("/repo")).toBeNull();
    });

    it("returns null for missing repo", () => {
      expect(splitRepoFullName("owner/")).toBeNull();
    });

    it("handles multiple slashes (takes first two parts)", () => {
      // Only splits on first slash, remaining slashes end up in repo
      const result = splitRepoFullName("owner/repo/extra");
      expect(result).toEqual({ owner: "owner", repo: "repo" });
    });
  });

  describe("buildMergeCommitInfo", () => {
    describe("merge method", () => {
      it("builds merge commit title with PR number and branch", () => {
        const result = buildMergeCommitInfo({
          method: "merge",
          number: 42,
          owner: "octocat",
          headRef: "feature-branch",
          prTitle: "Add feature",
          prBody: "This adds a cool feature",
        });
        expect(result.commitTitle).toBe(
          "Merge pull request #42 from octocat/feature-branch"
        );
        expect(result.commitMessage).toBe("This adds a cool feature");
      });

      it("handles null PR body", () => {
        const result = buildMergeCommitInfo({
          method: "merge",
          number: 1,
          owner: "owner",
          headRef: "branch",
          prTitle: "Title",
          prBody: null,
        });
        expect(result.commitTitle).toContain("Merge pull request #1");
        expect(result.commitMessage).toBeUndefined();
      });

      it("handles empty PR body", () => {
        const result = buildMergeCommitInfo({
          method: "merge",
          number: 1,
          owner: "owner",
          headRef: "branch",
          prTitle: "Title",
          prBody: "   ",
        });
        expect(result.commitMessage).toBeUndefined();
      });
    });

    describe("squash method", () => {
      it("uses PR title with number when multiple commits", () => {
        const result = buildMergeCommitInfo({
          method: "squash",
          number: 99,
          owner: "owner",
          headRef: "branch",
          prTitle: "Implement feature X",
          prBody: "Description",
          commitCount: 5,
        });
        expect(result.commitTitle).toBe("Implement feature X (#99)");
        expect(result.commitMessage).toBeUndefined();
      });

      it("uses first commit title when single commit", () => {
        const result = buildMergeCommitInfo({
          method: "squash",
          number: 10,
          owner: "owner",
          headRef: "branch",
          prTitle: "PR Title",
          prBody: null,
          commitCount: 1,
          firstCommit: {
            title: "fix: resolve bug in parser",
            message: "Detailed explanation here",
          },
        });
        expect(result.commitTitle).toBe("fix: resolve bug in parser (#10)");
        expect(result.commitMessage).toBe("Detailed explanation here");
      });

      it("falls back to PR title if first commit has no title", () => {
        const result = buildMergeCommitInfo({
          method: "squash",
          number: 5,
          owner: "owner",
          headRef: "branch",
          prTitle: "Feature PR",
          prBody: null,
          commitCount: 1,
          firstCommit: {
            title: "",
            message: "body only",
          },
        });
        expect(result.commitTitle).toBe("Feature PR (#5)");
      });

      it("handles single commit without firstCommit data", () => {
        const result = buildMergeCommitInfo({
          method: "squash",
          number: 7,
          owner: "owner",
          headRef: "branch",
          prTitle: "Some PR",
          prBody: null,
          commitCount: 1,
        });
        expect(result.commitTitle).toBe("Some PR (#7)");
      });

      it("handles undefined commitCount", () => {
        const result = buildMergeCommitInfo({
          method: "squash",
          number: 3,
          owner: "owner",
          headRef: "branch",
          prTitle: "Title",
          prBody: null,
        });
        expect(result.commitTitle).toBe("Title (#3)");
      });
    });

    describe("rebase method", () => {
      it("returns empty object for rebase", () => {
        const result = buildMergeCommitInfo({
          method: "rebase",
          number: 50,
          owner: "owner",
          headRef: "branch",
          prTitle: "Rebase PR",
          prBody: "Body text",
        });
        expect(result).toEqual({});
      });
    });
  });

  describe("emptyAggregate", () => {
    it("returns default aggregate state", () => {
      const result = emptyAggregate();
      expect(result).toEqual({
        state: "none",
        isDraft: false,
        mergeStatus: "none",
      });
    });

    it("returns a new object each time", () => {
      const a = emptyAggregate();
      const b = emptyAggregate();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });
  });

  describe("buildPrDescription", () => {
    it("uses taskText when provided", () => {
      const result = buildPrDescription({
        taskText: "Fix the authentication bug",
        title: "PR Title",
      });
      expect(result).toContain("## Task");
      expect(result).toContain("Fix the authentication bug");
      expect(result).not.toContain("## Summary");
    });

    it("uses title as summary when no taskText", () => {
      const result = buildPrDescription({
        title: "Add new feature",
      });
      expect(result).toContain("## Summary");
      expect(result).toContain("Add new feature");
      expect(result).not.toContain("## Task");
    });

    it("appends summary when provided", () => {
      const result = buildPrDescription({
        taskText: "Task description",
        title: "Title",
        summary: "Additional details about the changes",
      });
      expect(result).toContain("## Task");
      expect(result).toContain("Task description");
      expect(result).toContain("Additional details about the changes");
    });

    it("handles empty summary", () => {
      const result = buildPrDescription({
        title: "Title",
        summary: "",
      });
      expect(result).toBe("## Summary\n\nTitle");
    });

    it("handles whitespace-only summary", () => {
      const result = buildPrDescription({
        title: "Title",
        summary: "   ",
      });
      expect(result).toBe("## Summary\n\nTitle");
    });

    it("joins parts with double newlines", () => {
      const result = buildPrDescription({
        taskText: "Task",
        title: "Title",
        summary: "Summary text",
      });
      expect(result).toBe("## Task\n\nTask\n\nSummary text");
    });

    it("handles undefined taskText", () => {
      const result = buildPrDescription({
        taskText: undefined,
        title: "Fallback title",
        summary: "Details",
      });
      expect(result).toContain("## Summary");
      expect(result).toContain("Fallback title");
      expect(result).toContain("Details");
    });
  });
});
