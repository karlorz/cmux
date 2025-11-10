import { describe, expect, it } from "vitest";
import { parseGithubPullRequestUrl } from "./parse-github-pull-request-url";

describe("parseGithubPullRequestUrl", () => {
  it("parses https PR URLs", () => {
    expect(
      parseGithubPullRequestUrl("https://github.com/cmux/cmux/pull/123"),
    ).toEqual({
      owner: "cmux",
      repo: "cmux",
      fullName: "cmux/cmux",
      number: 123,
      url: "https://github.com/cmux/cmux/pull/123",
    });
  });

  it("parses URLs without protocol", () => {
    expect(parseGithubPullRequestUrl("github.com/cmux/cmux/pull/42")).toEqual({
      owner: "cmux",
      repo: "cmux",
      fullName: "cmux/cmux",
      number: 42,
      url: "https://github.com/cmux/cmux/pull/42",
    });
  });

  it("parses URLs with trailing segments and .git suffix", () => {
    expect(
      parseGithubPullRequestUrl(
        "https://github.com/cmux/cmux.git/pull/8/files",
      ),
    ).toEqual({
      owner: "cmux",
      repo: "cmux",
      fullName: "cmux/cmux",
      number: 8,
      url: "https://github.com/cmux/cmux/pull/8",
    });
  });

  it("returns null for invalid inputs", () => {
    expect(parseGithubPullRequestUrl("")).toBeNull();
    expect(parseGithubPullRequestUrl("https://example.com/foo")).toBeNull();
    expect(parseGithubPullRequestUrl("github.com/cmux/cmux/pulls")).toBeNull();
    expect(parseGithubPullRequestUrl("github.com/cmux/cmux/pull/not-a-number")).toBeNull();
  });
});
