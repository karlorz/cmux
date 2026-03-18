import { describe, expect, it } from "vitest";

import {
  buildCrownEvaluationPrompt,
  parseCrownEvaluationPrompt,
  isEmptyDiff,
  detectEmptyDiffs,
} from "./retryData";

describe("crown retryData", () => {
  it("roundtrips a prompt + candidates", () => {
    const prompt = "Fix the bug";
    const evaluationPrompt = buildCrownEvaluationPrompt(prompt, [
      {
        runId: "run_1",
        agentName: "agent-a",
        modelName: "model-a",
        gitDiff: "diff --git a/x b/x",
        newBranch: "branch-a",
        index: 0,
      },
      {
        runId: "run_2",
        agentName: "agent-b",
        gitDiff: "diff --git a/y b/y",
        newBranch: null,
        index: 1,
      },
    ]);

    const parsed = parseCrownEvaluationPrompt(evaluationPrompt);
    expect(parsed).not.toBeNull();
    expect(parsed?.prompt).toBe(prompt);
    expect(parsed?.candidates).toHaveLength(2);
    expect(parsed?.candidates[0]?.runId).toBe("run_1");
    expect(parsed?.candidates[1]?.runId).toBe("run_2");
  });

  it("returns null for invalid formats", () => {
    expect(parseCrownEvaluationPrompt("")).toBeNull();
    expect(parseCrownEvaluationPrompt("Task: x")).toBeNull();
    expect(parseCrownEvaluationPrompt("Task: x\nCandidates: nope")).toBeNull();
  });

  it("filters candidates missing required fields", () => {
    const evaluationPrompt = `Task: test\nCandidates: ${JSON.stringify([
      { runId: "ok", agentName: "a", gitDiff: "diff", index: 0 },
      { runId: "missingDiff", agentName: "b" },
      { agentName: "missingRunId", gitDiff: "diff" },
    ])}`;

    const parsed = parseCrownEvaluationPrompt(evaluationPrompt);
    expect(parsed?.candidates).toHaveLength(1);
    expect(parsed?.candidates[0]?.runId).toBe("ok");
  });
});

describe("isEmptyDiff", () => {
  describe("returns true for empty diffs", () => {
    it("handles null", () => {
      expect(isEmptyDiff(null)).toBe(true);
    });

    it("handles undefined", () => {
      expect(isEmptyDiff(undefined)).toBe(true);
    });

    it("handles empty string", () => {
      expect(isEmptyDiff("")).toBe(true);
    });

    it("handles very short strings (< 10 chars)", () => {
      expect(isEmptyDiff("short")).toBe(true);
      expect(isEmptyDiff("123456789")).toBe(true);
    });

    it("handles placeholder: <no code changes>", () => {
      expect(isEmptyDiff("<no code changes>")).toBe(true);
    });

    it("handles placeholder: <no code changes captured>", () => {
      expect(isEmptyDiff("<no code changes captured>")).toBe(true);
    });

    it("handles placeholder: <git diff not available>", () => {
      expect(isEmptyDiff("<git diff not available>")).toBe(true);
    });

    it("handles placeholder: <no branch available>", () => {
      expect(isEmptyDiff("<no branch available>")).toBe(true);
    });

    it("handles placeholders case-insensitively", () => {
      expect(isEmptyDiff("<NO CODE CHANGES>")).toBe(true);
      expect(isEmptyDiff("<No Code Changes>")).toBe(true);
    });

    it("handles placeholders with surrounding whitespace", () => {
      expect(isEmptyDiff("  <no code changes>  ")).toBe(true);
    });
  });

  describe("returns false for real diffs", () => {
    it("handles actual git diff content", () => {
      expect(isEmptyDiff("diff --git a/file.ts b/file.ts")).toBe(false);
    });

    it("handles multi-line diffs", () => {
      const diff = `diff --git a/x.ts b/x.ts
--- a/x.ts
+++ b/x.ts
@@ -1 +1 @@
-old
+new`;
      expect(isEmptyDiff(diff)).toBe(false);
    });

    it("handles strings exactly 10 chars", () => {
      expect(isEmptyDiff("1234567890")).toBe(false);
    });
  });
});

describe("detectEmptyDiffs", () => {
  it("returns true for empty array", () => {
    expect(detectEmptyDiffs([])).toBe(true);
  });

  it("returns true when all candidates have empty diffs", () => {
    expect(
      detectEmptyDiffs([
        { gitDiff: "" },
        { gitDiff: "<no code changes>" },
        { gitDiff: "short" },
      ])
    ).toBe(true);
  });

  it("returns false when at least one candidate has a real diff", () => {
    expect(
      detectEmptyDiffs([
        { gitDiff: "" },
        { gitDiff: "diff --git a/file.ts b/file.ts" },
      ])
    ).toBe(false);
  });

  it("returns false when all candidates have real diffs", () => {
    expect(
      detectEmptyDiffs([
        { gitDiff: "diff --git a/a.ts b/a.ts" },
        { gitDiff: "diff --git a/b.ts b/b.ts" },
      ])
    ).toBe(false);
  });
});

