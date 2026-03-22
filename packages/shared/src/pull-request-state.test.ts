import { describe, expect, it } from "vitest";
import {
  sortPullRequestInfos,
  aggregatePullRequestState,
  reconcilePullRequestRecords,
  isBetterState,
  type StoredPullRequestInfo,
  type PullRequestActionResult,
  type RunPullRequestState,
} from "./pull-request-state";

describe("pull-request-state", () => {
  describe("sortPullRequestInfos", () => {
    it("sorts records alphabetically by repoFullName", () => {
      const records = [
        { repoFullName: "zebra/repo" },
        { repoFullName: "alpha/repo" },
        { repoFullName: "middle/repo" },
      ];
      const sorted = sortPullRequestInfos(records);

      expect(sorted.map((r) => r.repoFullName)).toEqual([
        "alpha/repo",
        "middle/repo",
        "zebra/repo",
      ]);
    });

    it("handles empty array", () => {
      const sorted = sortPullRequestInfos([]);
      expect(sorted).toEqual([]);
    });

    it("trims whitespace when sorting", () => {
      const records = [
        { repoFullName: "  zebra/repo  " },
        { repoFullName: "alpha/repo" },
      ];
      const sorted = sortPullRequestInfos(records);

      // Should sort based on trimmed names
      expect(sorted[0].repoFullName).toBe("alpha/repo");
    });

    it("does not mutate original array", () => {
      const records = [{ repoFullName: "b/repo" }, { repoFullName: "a/repo" }];
      sortPullRequestInfos(records);

      expect(records[0].repoFullName).toBe("b/repo");
    });
  });

  describe("aggregatePullRequestState", () => {
    it("returns none state for empty records", () => {
      const result = aggregatePullRequestState([]);

      expect(result.state).toBe("none");
      expect(result.isDraft).toBe(false);
      expect(result.mergeStatus).toBe("none");
    });

    it("returns merged when all PRs are merged", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "merged" },
        { repoFullName: "b/repo", state: "merged" },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.state).toBe("merged");
      expect(result.mergeStatus).toBe("pr_merged");
    });

    it("prioritizes open over other states", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "merged" },
        { repoFullName: "b/repo", state: "open" },
        { repoFullName: "c/repo", state: "draft" },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.state).toBe("open");
      expect(result.mergeStatus).toBe("pr_open");
    });

    it("prioritizes draft over closed/unknown/none", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "closed" },
        { repoFullName: "b/repo", state: "draft" },
        { repoFullName: "c/repo", state: "none" },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.state).toBe("draft");
      expect(result.isDraft).toBe(true);
      expect(result.mergeStatus).toBe("pr_draft");
    });

    it("prioritizes closed over unknown/none", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "unknown" },
        { repoFullName: "b/repo", state: "closed" },
        { repoFullName: "c/repo", state: "none" },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.state).toBe("closed");
      expect(result.mergeStatus).toBe("pr_closed");
    });

    it("returns first URL from sorted records", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "z/repo", state: "open", url: "https://z.com/pr/1" },
        { repoFullName: "a/repo", state: "open", url: "https://a.com/pr/1" },
      ];
      const result = aggregatePullRequestState(records);

      // a/repo comes first alphabetically
      expect(result.url).toBe("https://a.com/pr/1");
    });

    it("returns first number from sorted records", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "z/repo", state: "open", number: 999 },
        { repoFullName: "a/repo", state: "open", number: 1 },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.number).toBe(1);
    });

    it("skips records without URL/number when finding first", () => {
      const records: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "open" }, // no URL
        { repoFullName: "b/repo", state: "open", url: "https://b.com/pr/1" },
      ];
      const result = aggregatePullRequestState(records);

      expect(result.url).toBe("https://b.com/pr/1");
    });
  });

  describe("isBetterState", () => {
    it("returns false when states are equal", () => {
      expect(isBetterState("open", "open")).toBe(false);
      expect(isBetterState("none", "none")).toBe(false);
    });

    it("returns true when open vs draft", () => {
      expect(isBetterState("open", "draft")).toBe(true);
    });

    it("returns false when draft vs open", () => {
      expect(isBetterState("draft", "open")).toBe(false);
    });

    it("returns true when draft vs closed", () => {
      expect(isBetterState("draft", "closed")).toBe(true);
    });

    it("returns true when closed vs unknown", () => {
      expect(isBetterState("closed", "unknown")).toBe(true);
    });

    it("returns true when unknown vs none", () => {
      expect(isBetterState("unknown", "none")).toBe(true);
    });

    it("returns true for merged vs none", () => {
      // merged is not in priority list, so returns true
      expect(isBetterState("merged", "none")).toBe(true);
    });

    it("handles unknown states gracefully", () => {
      // If state not in priority list, returns true
      expect(isBetterState("merged" as RunPullRequestState, "open")).toBe(true);
    });
  });

  describe("reconcilePullRequestRecords", () => {
    it("returns empty records for empty inputs", () => {
      const result = reconcilePullRequestRecords({
        existing: [],
        updates: [],
      });

      expect(result.records).toEqual([]);
      expect(result.aggregate.state).toBe("none");
      expect(result.errors).toEqual([]);
    });

    it("preserves existing records when no updates", () => {
      const existing: StoredPullRequestInfo[] = [
        { repoFullName: "owner/repo", state: "open", url: "https://example.com/pr/1" },
      ];
      const result = reconcilePullRequestRecords({
        existing,
        updates: [],
      });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].state).toBe("open");
      expect(result.records[0].url).toBe("https://example.com/pr/1");
    });

    it("merges update with existing record", () => {
      const existing: StoredPullRequestInfo[] = [
        { repoFullName: "owner/repo", state: "draft", url: "https://example.com/pr/1" },
      ];
      const updates: PullRequestActionResult[] = [
        { repoFullName: "owner/repo", state: "open" },
      ];
      const result = reconcilePullRequestRecords({
        existing,
        updates,
      });

      expect(result.records[0].state).toBe("open");
      // URL should be preserved from existing
      expect(result.records[0].url).toBe("https://example.com/pr/1");
    });

    it("adds new records from updates", () => {
      const updates: PullRequestActionResult[] = [
        { repoFullName: "owner/new-repo", state: "open", url: "https://example.com/pr/2" },
      ];
      const result = reconcilePullRequestRecords({
        existing: [],
        updates,
      });

      expect(result.records).toHaveLength(1);
      expect(result.records[0].repoFullName).toBe("owner/new-repo");
      expect(result.records[0].state).toBe("open");
    });

    it("extracts errors from updates", () => {
      const updates: PullRequestActionResult[] = [
        { repoFullName: "owner/repo", state: "none", error: "Failed to create PR" },
      ];
      const result = reconcilePullRequestRecords({
        existing: [],
        updates,
      });

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].error).toBe("Failed to create PR");
    });

    it("preserves existing record when update has error", () => {
      const existing: StoredPullRequestInfo[] = [
        { repoFullName: "owner/repo", state: "open", url: "https://example.com/pr/1" },
      ];
      const updates: PullRequestActionResult[] = [
        { repoFullName: "owner/repo", state: "none", error: "Sync failed" },
      ];
      const result = reconcilePullRequestRecords({
        existing,
        updates,
      });

      // Should keep existing state since update had error
      expect(result.records[0].state).toBe("open");
      expect(result.records[0].url).toBe("https://example.com/pr/1");
    });

    it("includes repos from repoFullNames even if not in existing/updates", () => {
      const result = reconcilePullRequestRecords({
        existing: [],
        updates: [],
        repoFullNames: ["owner/repo1", "owner/repo2"],
      });

      expect(result.records).toHaveLength(2);
      expect(result.records.map((r) => r.repoFullName)).toContain("owner/repo1");
      expect(result.records.map((r) => r.repoFullName)).toContain("owner/repo2");
      // Default state should be none
      expect(result.records[0].state).toBe("none");
    });

    it("handles isDraft correctly", () => {
      const updates: PullRequestActionResult[] = [
        { repoFullName: "owner/repo", state: "draft", isDraft: true },
      ];
      const result = reconcilePullRequestRecords({
        existing: [],
        updates,
      });

      expect(result.records[0].isDraft).toBe(true);
    });

    it("sorts output records alphabetically", () => {
      const existing: StoredPullRequestInfo[] = [
        { repoFullName: "z/repo", state: "open" },
        { repoFullName: "a/repo", state: "open" },
      ];
      const result = reconcilePullRequestRecords({
        existing,
        updates: [],
      });

      expect(result.records[0].repoFullName).toBe("a/repo");
      expect(result.records[1].repoFullName).toBe("z/repo");
    });

    it("calculates aggregate correctly", () => {
      const existing: StoredPullRequestInfo[] = [
        { repoFullName: "a/repo", state: "open", url: "https://a.com/pr/1" },
        { repoFullName: "b/repo", state: "draft" },
      ];
      const result = reconcilePullRequestRecords({
        existing,
        updates: [],
      });

      expect(result.aggregate.state).toBe("open");
      expect(result.aggregate.mergeStatus).toBe("pr_open");
      expect(result.aggregate.url).toBe("https://a.com/pr/1");
    });
  });
});
