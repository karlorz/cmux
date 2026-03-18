import { describe, expect, it } from "vitest";
import { deriveRepoBaseName } from "./derive-repo-base-name";

describe("deriveRepoBaseName", () => {
  describe("from projectFullName", () => {
    it("extracts repo name from owner/repo format", () => {
      expect(deriveRepoBaseName({ projectFullName: "anthropics/claude-code" })).toBe(
        "claude-code"
      );
    });

    it("extracts repo name from org/repo format", () => {
      expect(deriveRepoBaseName({ projectFullName: "facebook/react" })).toBe(
        "react"
      );
    });

    it("handles nested paths", () => {
      expect(
        deriveRepoBaseName({ projectFullName: "gitlab.com/group/subgroup/repo" })
      ).toBe("repo");
    });

    it("returns full name if no slash", () => {
      expect(deriveRepoBaseName({ projectFullName: "simple-repo" })).toBe(
        "simple-repo"
      );
    });

    it("trims whitespace", () => {
      expect(deriveRepoBaseName({ projectFullName: "  owner/repo  " })).toBe(
        "repo"
      );
    });

    it("handles trailing slash", () => {
      // Last part after slash is empty, so returns the part before
      expect(deriveRepoBaseName({ projectFullName: "owner/" })).toBe("owner/");
    });
  });

  describe("from repoUrl", () => {
    it("extracts from HTTPS GitHub URL", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "https://github.com/owner/my-repo.git" })
      ).toBe("my-repo");
    });

    it("extracts from HTTPS URL without .git suffix", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "https://github.com/owner/my-repo" })
      ).toBe("my-repo");
    });

    it("extracts from GitLab URL", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "https://gitlab.com/group/project.git" })
      ).toBe("project");
    });

    it("handles case-insensitive .git suffix", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "https://github.com/owner/repo.GIT" })
      ).toBe("repo");
    });

    it("handles SSH-style URLs via fallback", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "git@github.com:owner/repo.git" })
      ).toBe("repo");
    });

    it("trims whitespace", () => {
      expect(
        deriveRepoBaseName({ repoUrl: "  https://github.com/owner/repo.git  " })
      ).toBe("repo");
    });
  });

  describe("priority and edge cases", () => {
    it("prefers projectFullName over repoUrl", () => {
      expect(
        deriveRepoBaseName({
          projectFullName: "owner/preferred-name",
          repoUrl: "https://github.com/owner/other-name.git",
        })
      ).toBe("preferred-name");
    });

    it("falls back to repoUrl when projectFullName is empty", () => {
      expect(
        deriveRepoBaseName({
          projectFullName: "",
          repoUrl: "https://github.com/owner/fallback.git",
        })
      ).toBe("fallback");
    });

    it("falls back to repoUrl when projectFullName is whitespace only", () => {
      expect(
        deriveRepoBaseName({
          projectFullName: "   ",
          repoUrl: "https://github.com/owner/fallback.git",
        })
      ).toBe("fallback");
    });

    it("returns undefined when both are empty", () => {
      expect(deriveRepoBaseName({ projectFullName: "", repoUrl: "" })).toBeUndefined();
    });

    it("returns undefined when both are null", () => {
      expect(
        deriveRepoBaseName({ projectFullName: null, repoUrl: null })
      ).toBeUndefined();
    });

    it("returns undefined when neither provided", () => {
      expect(deriveRepoBaseName({})).toBeUndefined();
    });

    it("returns undefined for invalid URL with no fallback match", () => {
      expect(deriveRepoBaseName({ repoUrl: "not-a-url" })).toBeUndefined();
    });
  });
});
