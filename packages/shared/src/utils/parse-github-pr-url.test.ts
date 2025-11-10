import { describe, expect, it } from "vitest";
import { parseGithubPullRequestUrl } from "./parse-github-pr-url";

describe("parseGithubPullRequestUrl", () => {
  it("parses a basic PR URL", () => {
    const result = parseGithubPullRequestUrl(
      "https://github.com/cmux-dev/cmux/pull/123"
    );
    expect(result).toEqual({
      owner: "cmux-dev",
      repo: "cmux",
      number: 123,
      repoFullName: "cmux-dev/cmux",
      url: "https://github.com/cmux-dev/cmux/pull/123",
    });
  });

  it("normalizes URLs with extra segments and query params", () => {
    const result = parseGithubPullRequestUrl(
      "https://github.com/foo/bar/pull/99/files?diff=split"
    );
    expect(result).toEqual({
      owner: "foo",
      repo: "bar",
      number: 99,
      repoFullName: "foo/bar",
      url: "https://github.com/foo/bar/pull/99",
    });
  });

  it("accepts www.github.com host", () => {
    const result = parseGithubPullRequestUrl(
      "https://www.github.com/org/project/pull/1"
    );
    expect(result?.repoFullName).toBe("org/project");
  });

  it("returns null for invalid inputs", () => {
    expect(parseGithubPullRequestUrl("")).toBeNull();
    expect(parseGithubPullRequestUrl("https://example.com/foo/bar")).toBeNull();
    expect(parseGithubPullRequestUrl("https://github.com/foo/bar/issues/10")).toBeNull();
    expect(parseGithubPullRequestUrl("https://github.com/foo/bar/pull/not-a-number")).toBeNull();
  });
});
