import { describe, expect, test } from "vitest";
import { parseGithubWorkspaceTarget } from "./parse-github-target";

describe("parseGithubWorkspaceTarget", () => {
  test("parses pull request URLs", () => {
    const target = parseGithubWorkspaceTarget(
      "https://github.com/manaflow-ai/cmux/pull/914/files"
    );
    expect(target).toEqual({
      type: "pull-request",
      owner: "manaflow-ai",
      repo: "cmux",
      fullName: "manaflow-ai/cmux",
      number: 914,
      url: "https://github.com/manaflow-ai/cmux/pull/914",
      label: "PR #914",
      source: "https://github.com/manaflow-ai/cmux/pull/914/files",
    });
  });

  test("parses branch URLs that include slashes", () => {
    const target = parseGithubWorkspaceTarget(
      "https://github.com/manaflow-ai/cmux/tree/cmux/feature/test"
    );
    expect(target).toEqual({
      type: "branch",
      owner: "manaflow-ai",
      repo: "cmux",
      fullName: "manaflow-ai/cmux",
      branch: "cmux/feature/test",
      url: "https://github.com/manaflow-ai/cmux/tree/cmux/feature/test",
      label: "cmux/feature/test",
      source: "https://github.com/manaflow-ai/cmux/tree/cmux/feature/test",
    });
  });

  test("parses repo URLs", () => {
    const target = parseGithubWorkspaceTarget("https://github.com/manaflow-ai/cmux");
    expect(target).toEqual({
      type: "repo",
      owner: "manaflow-ai",
      repo: "cmux",
      fullName: "manaflow-ai/cmux",
      url: "https://github.com/manaflow-ai/cmux",
      label: "manaflow-ai/cmux",
      source: "https://github.com/manaflow-ai/cmux",
    });
  });

  test("rejects non-GitHub URLs", () => {
    expect(parseGithubWorkspaceTarget("https://example.com/foo")).toBeNull();
  });
});
