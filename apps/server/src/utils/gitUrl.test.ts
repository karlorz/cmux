import { describe, expect, it } from "vitest";
import {
  hasEmbeddedCredentials,
  sanitizeGitUrl,
  validateBranchName,
} from "./gitUrl";

describe("hasEmbeddedCredentials", () => {
  describe("returns true for URLs with credentials", () => {
    it("detects username only", () => {
      expect(hasEmbeddedCredentials("https://user@github.com/repo.git")).toBe(
        true
      );
    });

    it("detects username and password", () => {
      expect(
        hasEmbeddedCredentials("https://user:pass@github.com/repo.git")
      ).toBe(true);
    });

    it("detects access token format", () => {
      expect(
        hasEmbeddedCredentials(
          "https://x-access-token:TOKEN@github.com/user/repo.git"
        )
      ).toBe(true);
    });

    it("works with http protocol", () => {
      expect(hasEmbeddedCredentials("http://user:pass@example.com/repo")).toBe(
        true
      );
    });
  });

  describe("returns false for URLs without credentials", () => {
    it("handles clean https URL", () => {
      expect(hasEmbeddedCredentials("https://github.com/user/repo.git")).toBe(
        false
      );
    });

    it("handles clean http URL", () => {
      expect(hasEmbeddedCredentials("http://example.com/repo.git")).toBe(false);
    });

    it("handles SSH URLs", () => {
      expect(hasEmbeddedCredentials("git@github.com:user/repo.git")).toBe(
        false
      );
    });

    it("handles git protocol URLs", () => {
      expect(hasEmbeddedCredentials("git://github.com/user/repo.git")).toBe(
        false
      );
    });
  });

  describe("edge cases", () => {
    it("handles invalid URLs", () => {
      expect(hasEmbeddedCredentials("not-a-url")).toBe(false);
    });

    it("handles empty string", () => {
      expect(hasEmbeddedCredentials("")).toBe(false);
    });
  });
});

describe("sanitizeGitUrl", () => {
  describe("removes credentials from URLs", () => {
    it("removes username", () => {
      expect(sanitizeGitUrl("https://user@github.com/repo.git")).toBe(
        "https://github.com/repo.git"
      );
    });

    it("removes username and password", () => {
      expect(sanitizeGitUrl("https://user:pass@github.com/repo.git")).toBe(
        "https://github.com/repo.git"
      );
    });

    it("removes access token", () => {
      expect(
        sanitizeGitUrl("https://x-access-token:TOKEN@github.com/user/repo.git")
      ).toBe("https://github.com/user/repo.git");
    });

    it("works with http protocol", () => {
      expect(sanitizeGitUrl("http://user:pass@example.com/repo")).toBe(
        "http://example.com/repo"
      );
    });

    it("preserves port numbers", () => {
      expect(sanitizeGitUrl("https://user:pass@example.com:8080/repo")).toBe(
        "https://example.com:8080/repo"
      );
    });

    it("preserves query parameters", () => {
      expect(sanitizeGitUrl("https://user@example.com/repo?ref=main")).toBe(
        "https://example.com/repo?ref=main"
      );
    });
  });

  describe("returns URL unchanged when no credentials", () => {
    it("handles clean https URL", () => {
      const url = "https://github.com/user/repo.git";
      expect(sanitizeGitUrl(url)).toBe(url);
    });

    it("handles clean http URL", () => {
      const url = "http://example.com/repo.git";
      expect(sanitizeGitUrl(url)).toBe(url);
    });

    it("handles SSH URLs unchanged", () => {
      const url = "git@github.com:user/repo.git";
      expect(sanitizeGitUrl(url)).toBe(url);
    });

    it("handles git protocol URLs unchanged", () => {
      const url = "git://github.com/user/repo.git";
      expect(sanitizeGitUrl(url)).toBe(url);
    });
  });

  describe("edge cases", () => {
    it("handles invalid URLs", () => {
      expect(sanitizeGitUrl("not-a-url")).toBe("not-a-url");
    });

    it("handles empty string", () => {
      expect(sanitizeGitUrl("")).toBe("");
    });
  });
});

describe("validateBranchName", () => {
  describe("valid branch names", () => {
    it("accepts simple names", () => {
      expect(() => validateBranchName("main")).not.toThrow();
      expect(() => validateBranchName("master")).not.toThrow();
      expect(() => validateBranchName("develop")).not.toThrow();
    });

    it("accepts feature branch format", () => {
      expect(() => validateBranchName("feature/add-login")).not.toThrow();
      expect(() => validateBranchName("fix/bug-123")).not.toThrow();
    });

    it("accepts hyphens", () => {
      expect(() => validateBranchName("my-branch")).not.toThrow();
      expect(() => validateBranchName("feature-branch-name")).not.toThrow();
    });

    it("accepts underscores", () => {
      expect(() => validateBranchName("my_branch")).not.toThrow();
      expect(() => validateBranchName("feature_test_branch")).not.toThrow();
    });

    it("accepts periods in middle", () => {
      expect(() => validateBranchName("release.1.0")).not.toThrow();
      expect(() => validateBranchName("v1.0.0")).not.toThrow();
    });

    it("accepts numbers", () => {
      expect(() => validateBranchName("v123")).not.toThrow();
      expect(() => validateBranchName("1")).not.toThrow();
    });

    it("accepts single character names", () => {
      expect(() => validateBranchName("a")).not.toThrow();
      expect(() => validateBranchName("1")).not.toThrow();
    });

    it("accepts nested paths", () => {
      expect(() => validateBranchName("feature/user/login")).not.toThrow();
      expect(() => validateBranchName("refs/heads/main")).not.toThrow();
    });
  });

  describe("invalid branch names", () => {
    it("rejects empty string", () => {
      expect(() => validateBranchName("")).toThrow("cannot be empty");
    });

    it("rejects names over 255 characters", () => {
      const longName = "a".repeat(256);
      expect(() => validateBranchName(longName)).toThrow("too long");
    });

    it("rejects double dots", () => {
      expect(() => validateBranchName("branch..name")).toThrow(
        "cannot contain '..'"
      );
    });

    it("rejects leading dot", () => {
      expect(() => validateBranchName(".hidden")).toThrow(
        "cannot start or end with '.'"
      );
    });

    it("rejects trailing dot", () => {
      expect(() => validateBranchName("branch.")).toThrow(
        "cannot start or end with '.'"
      );
    });

    it("rejects leading slash", () => {
      expect(() => validateBranchName("/branch")).toThrow(
        "cannot start or end with '/'"
      );
    });

    it("rejects trailing slash", () => {
      expect(() => validateBranchName("branch/")).toThrow(
        "cannot start or end with '/'"
      );
    });

    it("rejects spaces", () => {
      expect(() => validateBranchName("my branch")).toThrow("Invalid branch");
    });

    it("rejects shell metacharacters", () => {
      expect(() => validateBranchName("branch;echo")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch|cat")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch&")).toThrow("Invalid branch");
      expect(() => validateBranchName("$(whoami)")).toThrow("Invalid branch");
      expect(() => validateBranchName("`id`")).toThrow("Invalid branch");
    });

    it("rejects special characters", () => {
      expect(() => validateBranchName("branch~name")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch^name")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch:name")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch?name")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch*name")).toThrow("Invalid branch");
      expect(() => validateBranchName("branch[0]")).toThrow("Invalid branch");
    });
  });

  describe("edge cases", () => {
    it("accepts exactly 255 characters", () => {
      const maxName = "a".repeat(255);
      expect(() => validateBranchName(maxName)).not.toThrow();
    });

    it("accepts mix of valid characters", () => {
      expect(() =>
        validateBranchName("feature/USER_login-v1.0")
      ).not.toThrow();
    });
  });
});
