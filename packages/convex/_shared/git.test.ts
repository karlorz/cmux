import { describe, expect, it } from "vitest";
import { normalizeRepoFullName } from "./git";

describe("git", () => {
  describe("normalizeRepoFullName", () => {
    describe("valid inputs", () => {
      it("normalizes simple owner/repo format", () => {
        expect(normalizeRepoFullName("owner/repo")).toBe("owner/repo");
      });

      it("lowercases the entire string", () => {
        expect(normalizeRepoFullName("Owner/Repo")).toBe("owner/repo");
        expect(normalizeRepoFullName("OWNER/REPO")).toBe("owner/repo");
      });

      it("removes .git suffix", () => {
        expect(normalizeRepoFullName("owner/repo.git")).toBe("owner/repo");
      });

      it("removes .GIT suffix (case insensitive)", () => {
        expect(normalizeRepoFullName("owner/repo.GIT")).toBe("owner/repo");
        expect(normalizeRepoFullName("owner/repo.Git")).toBe("owner/repo");
      });

      it("trims leading whitespace", () => {
        expect(normalizeRepoFullName("  owner/repo")).toBe("owner/repo");
      });

      it("trims trailing whitespace", () => {
        expect(normalizeRepoFullName("owner/repo  ")).toBe("owner/repo");
      });

      it("trims both leading and trailing whitespace", () => {
        expect(normalizeRepoFullName("  owner/repo  ")).toBe("owner/repo");
      });

      it("handles organization names with hyphens", () => {
        expect(normalizeRepoFullName("my-org/my-repo")).toBe("my-org/my-repo");
      });

      it("handles repo names with hyphens", () => {
        expect(normalizeRepoFullName("owner/my-cool-repo")).toBe("owner/my-cool-repo");
      });

      it("handles repo names with dots", () => {
        expect(normalizeRepoFullName("owner/repo.js")).toBe("owner/repo.js");
      });

      it("handles repo names with underscores", () => {
        expect(normalizeRepoFullName("owner/my_repo")).toBe("owner/my_repo");
      });

      it("handles numeric characters", () => {
        expect(normalizeRepoFullName("org123/repo456")).toBe("org123/repo456");
      });

      it("combines all normalizations", () => {
        expect(normalizeRepoFullName("  My-Org/My-Repo.git  ")).toBe("my-org/my-repo");
      });
    });

    describe("edge cases", () => {
      it("preserves single slash", () => {
        expect(normalizeRepoFullName("a/b")).toBe("a/b");
      });

      it("preserves multiple slashes (nested paths)", () => {
        // While not standard GitHub format, the function doesn't reject it
        expect(normalizeRepoFullName("a/b/c")).toBe("a/b/c");
      });

      it("handles repo name that starts with .git", () => {
        // .git at the start is not removed
        expect(normalizeRepoFullName("owner/.gitconfig")).toBe("owner/.gitconfig");
      });

      it("only removes .git at the end", () => {
        // .git in the middle is preserved
        expect(normalizeRepoFullName("owner/not.gitrepo")).toBe("owner/not.gitrepo");
      });
    });

    describe("invalid inputs", () => {
      it("throws for string without slash", () => {
        expect(() => normalizeRepoFullName("owner")).toThrow(
          "repoFullName must be in the form owner/name"
        );
      });

      it("throws for empty string", () => {
        expect(() => normalizeRepoFullName("")).toThrow(
          "repoFullName must be in the form owner/name"
        );
      });

      it("throws for whitespace-only string", () => {
        expect(() => normalizeRepoFullName("   ")).toThrow(
          "repoFullName must be in the form owner/name"
        );
      });

      it("throws for single word even if it ends with .git", () => {
        expect(() => normalizeRepoFullName("repo.git")).toThrow(
          "repoFullName must be in the form owner/name"
        );
      });
    });
  });
});
