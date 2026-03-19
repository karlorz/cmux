import { describe, expect, it } from "vitest";
import {
  EMPTY_AGGREGATE,
  mapGitHubStateToRunState,
  splitRepoFullName,
  toPullRequestActionResult,
} from "./pullRequestState";

describe("EMPTY_AGGREGATE", () => {
  it("has correct default values", () => {
    expect(EMPTY_AGGREGATE.state).toBe("none");
    expect(EMPTY_AGGREGATE.isDraft).toBe(false);
    expect(EMPTY_AGGREGATE.mergeStatus).toBe("none");
  });
});

describe("mapGitHubStateToRunState", () => {
  describe("merged state", () => {
    it("returns merged when merged is true", () => {
      expect(mapGitHubStateToRunState({ merged: true })).toBe("merged");
    });

    it("returns merged regardless of state when merged is true", () => {
      expect(mapGitHubStateToRunState({ state: "closed", merged: true })).toBe(
        "merged"
      );
    });

    it("returns merged regardless of draft when merged is true", () => {
      expect(mapGitHubStateToRunState({ draft: true, merged: true })).toBe(
        "merged"
      );
    });
  });

  describe("draft state", () => {
    it("returns draft when draft is true and not merged", () => {
      expect(mapGitHubStateToRunState({ draft: true })).toBe("draft");
    });

    it("returns draft regardless of state when draft is true", () => {
      expect(mapGitHubStateToRunState({ state: "open", draft: true })).toBe(
        "draft"
      );
    });
  });

  describe("open state", () => {
    it("returns open for lowercase open state", () => {
      expect(mapGitHubStateToRunState({ state: "open" })).toBe("open");
    });

    it("returns open for uppercase OPEN state", () => {
      expect(mapGitHubStateToRunState({ state: "OPEN" })).toBe("open");
    });

    it("returns open for mixed case Open state", () => {
      expect(mapGitHubStateToRunState({ state: "Open" })).toBe("open");
    });
  });

  describe("closed state", () => {
    it("returns closed for lowercase closed state", () => {
      expect(mapGitHubStateToRunState({ state: "closed" })).toBe("closed");
    });

    it("returns closed for uppercase CLOSED state", () => {
      expect(mapGitHubStateToRunState({ state: "CLOSED" })).toBe("closed");
    });
  });

  describe("none and unknown states", () => {
    it("returns none for empty state", () => {
      expect(mapGitHubStateToRunState({ state: "" })).toBe("none");
    });

    it("returns none for undefined state", () => {
      expect(mapGitHubStateToRunState({})).toBe("none");
    });

    it("returns unknown for unrecognized state", () => {
      expect(mapGitHubStateToRunState({ state: "pending" })).toBe("unknown");
    });

    it("returns unknown for invalid state", () => {
      expect(mapGitHubStateToRunState({ state: "foobar" })).toBe("unknown");
    });
  });
});

describe("toPullRequestActionResult", () => {
  it("converts full PR data to action result", () => {
    const result = toPullRequestActionResult("owner/repo", {
      html_url: "https://github.com/owner/repo/pull/123",
      number: 123,
      state: "open",
      draft: false,
      merged_at: null,
    });

    expect(result.repoFullName).toBe("owner/repo");
    expect(result.url).toBe("https://github.com/owner/repo/pull/123");
    expect(result.number).toBe(123);
    expect(result.state).toBe("open");
    expect(result.isDraft).toBe(false);
  });

  it("marks as draft when draft is true", () => {
    const result = toPullRequestActionResult("owner/repo", {
      state: "open",
      draft: true,
    });

    expect(result.state).toBe("draft");
    expect(result.isDraft).toBe(true);
  });

  it("marks as merged when merged_at has a value", () => {
    const result = toPullRequestActionResult("owner/repo", {
      state: "closed",
      merged_at: "2024-01-01T00:00:00Z",
    });

    expect(result.state).toBe("merged");
  });

  it("handles minimal data", () => {
    const result = toPullRequestActionResult("owner/repo", {});

    expect(result.repoFullName).toBe("owner/repo");
    expect(result.url).toBeUndefined();
    expect(result.number).toBeUndefined();
    expect(result.state).toBe("none");
    expect(result.isDraft).toBeUndefined();
  });
});

describe("splitRepoFullName", () => {
  it("splits valid repo full name", () => {
    const result = splitRepoFullName("owner/repo");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("handles repo names with multiple slashes", () => {
    // Only first slash is used for splitting
    const result = splitRepoFullName("owner/repo/extra");
    expect(result).toEqual({ owner: "owner", repo: "repo" });
  });

  it("returns null for name without slash", () => {
    const result = splitRepoFullName("ownerrepo");
    expect(result).toBeNull();
  });

  it("returns null for empty string", () => {
    const result = splitRepoFullName("");
    expect(result).toBeNull();
  });

  it("returns null for single slash", () => {
    const result = splitRepoFullName("/");
    expect(result).toBeNull();
  });

  it("returns null for name starting with slash", () => {
    const result = splitRepoFullName("/repo");
    expect(result).toBeNull();
  });

  it("returns null for name ending with slash", () => {
    const result = splitRepoFullName("owner/");
    expect(result).toBeNull();
  });
});
