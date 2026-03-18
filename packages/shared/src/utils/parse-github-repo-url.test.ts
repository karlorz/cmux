import { describe, expect, it } from "vitest";
import { parseGithubRepoUrl } from "./parse-github-repo-url";

describe("parseGithubRepoUrl", () => {
  describe("simple owner/repo format", () => {
    it("parses owner/repo", () => {
      const result = parseGithubRepoUrl("anthropics/claude-code");
      expect(result).toEqual({
        owner: "anthropics",
        repo: "claude-code",
        fullName: "anthropics/claude-code",
        url: "https://github.com/anthropics/claude-code",
        gitUrl: "https://github.com/anthropics/claude-code.git",
      });
    });

    it("handles underscores and hyphens in owner", () => {
      const result = parseGithubRepoUrl("my_org-name/repo");
      expect(result?.owner).toBe("my_org-name");
    });

    it("handles dots in repo name", () => {
      const result = parseGithubRepoUrl("owner/repo.js");
      expect(result?.repo).toBe("repo.js");
    });

    it("handles numbers in names", () => {
      const result = parseGithubRepoUrl("user123/project456");
      expect(result?.fullName).toBe("user123/project456");
    });
  });

  describe("HTTPS URLs", () => {
    it("parses https://github.com/owner/repo", () => {
      const result = parseGithubRepoUrl("https://github.com/facebook/react");
      expect(result).toEqual({
        owner: "facebook",
        repo: "react",
        fullName: "facebook/react",
        url: "https://github.com/facebook/react",
        gitUrl: "https://github.com/facebook/react.git",
      });
    });

    it("parses URL with .git suffix", () => {
      const result = parseGithubRepoUrl(
        "https://github.com/owner/repo.git"
      );
      expect(result?.repo).toBe("repo");
      expect(result?.gitUrl).toBe("https://github.com/owner/repo.git");
    });

    it("parses URL with trailing slash", () => {
      const result = parseGithubRepoUrl("https://github.com/owner/repo/");
      expect(result?.repo).toBe("repo");
    });

    it("handles http:// protocol", () => {
      const result = parseGithubRepoUrl("http://github.com/owner/repo");
      expect(result?.owner).toBe("owner");
      expect(result?.repo).toBe("repo");
    });

    it("handles case-insensitive domain", () => {
      const result = parseGithubRepoUrl("https://GITHUB.COM/owner/repo");
      expect(result?.fullName).toBe("owner/repo");
    });
  });

  describe("SSH URLs", () => {
    it("parses git@github.com:owner/repo.git", () => {
      const result = parseGithubRepoUrl("git@github.com:vercel/next.js.git");
      expect(result).toEqual({
        owner: "vercel",
        repo: "next.js",
        fullName: "vercel/next.js",
        url: "https://github.com/vercel/next.js",
        gitUrl: "https://github.com/vercel/next.js.git",
      });
    });

    it("parses SSH URL without .git suffix", () => {
      const result = parseGithubRepoUrl("git@github.com:owner/repo");
      expect(result?.repo).toBe("repo");
    });
  });

  describe("edge cases and invalid inputs", () => {
    it("returns null for empty string", () => {
      expect(parseGithubRepoUrl("")).toBeNull();
    });

    it("returns null for null/undefined-like input", () => {
      expect(parseGithubRepoUrl("")).toBeNull();
    });

    it("trims whitespace", () => {
      const result = parseGithubRepoUrl("  owner/repo  ");
      expect(result?.fullName).toBe("owner/repo");
    });

    it("returns null for invalid format", () => {
      expect(parseGithubRepoUrl("just-a-string")).toBeNull();
      expect(parseGithubRepoUrl("https://gitlab.com/owner/repo")).toBeNull();
      expect(parseGithubRepoUrl("owner/")).toBeNull();
      expect(parseGithubRepoUrl("/repo")).toBeNull();
    });

    it("returns null for non-GitHub URLs", () => {
      expect(parseGithubRepoUrl("https://bitbucket.org/owner/repo")).toBeNull();
      expect(parseGithubRepoUrl("git@gitlab.com:owner/repo.git")).toBeNull();
    });

    it("returns null for malformed URLs", () => {
      expect(parseGithubRepoUrl("https://github.com/")).toBeNull();
      expect(parseGithubRepoUrl("https://github.com/owner")).toBeNull();
    });
  });

  describe("output consistency", () => {
    it("always returns HTTPS url format", () => {
      const inputs = [
        "owner/repo",
        "https://github.com/owner/repo",
        "git@github.com:owner/repo.git",
      ];
      for (const input of inputs) {
        const result = parseGithubRepoUrl(input);
        expect(result?.url).toBe("https://github.com/owner/repo");
      }
    });

    it("always returns gitUrl with .git suffix", () => {
      const inputs = [
        "owner/repo",
        "https://github.com/owner/repo",
        "https://github.com/owner/repo.git",
      ];
      for (const input of inputs) {
        const result = parseGithubRepoUrl(input);
        expect(result?.gitUrl).toBe("https://github.com/owner/repo.git");
      }
    });

    it("repo never has .git suffix", () => {
      const result = parseGithubRepoUrl("https://github.com/owner/repo.git");
      expect(result?.repo).toBe("repo");
      expect(result?.repo.endsWith(".git")).toBe(false);
    });
  });
});
