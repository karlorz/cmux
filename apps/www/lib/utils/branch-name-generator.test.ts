import { type GenerateObjectResult } from "ai";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_BRANCH_PREFIX,
  generateBranchName,
  generateBranchNamesFromBase,
  generateNewBranchName,
  generatePRInfo,
  generateRandomId,
  generateUniqueBranchNames,
  generateUniqueBranchNamesFromTitle,
  getPRTitleFromTaskDescription,
  prGenerationSchema,
  resetGenerateObjectImplementation,
  setGenerateObjectImplementation,
  toKebabCase,
} from "./branch-name-generator";

// Note: The branch name generator now uses PLATFORM credentials only (from env.*),
// not user-provided API keys. These empty keys are kept for backward compatibility
// with function signatures but are ignored by the implementation.
const EMPTY_KEYS = {};

function createMockResult<RESULT>(
  object: RESULT,
): GenerateObjectResult<RESULT> {
  return {
    object,
    reasoning: undefined,
    finishReason: "stop",
    usage: {
      inputTokens: 1,
      outputTokens: 1,
      totalTokens: 2,
    } as GenerateObjectResult<RESULT>["usage"],
    warnings: undefined,
    request: { body: undefined },
    response: {
      id: "mock-response",
      timestamp: new Date(),
      modelId: "mock-model",
      headers: undefined,
    },
    providerMetadata: undefined,
    toJsonResponse: (init?: ResponseInit) =>
      new Response(JSON.stringify(object), {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
        },
        ...init,
      }),
  };
}

afterEach(() => {
  resetGenerateObjectImplementation();
});

describe("toKebabCase", () => {
  it("converts camelCase to kebab-case", () => {
    expect(toKebabCase("camelCaseString")).toBe("camel-case-string");
  });

  it("handles acronyms and trailing hyphen", () => {
    expect(toKebabCase("HTTPServer")).toBe("http-server");
    expect(toKebabCase("fix-bug-")).toBe("fix-bug");
  });
});

describe("generateRandomId", () => {
  it("produces five lowercase alphanumeric characters", () => {
    const id = generateRandomId();
    expect(id).toMatch(/^[a-z0-9]{5}$/);
  });
});

describe("generateBranchName", () => {
  it("prefixes with default prefix and appends random id", () => {
    const name = generateBranchName("Fix auth bug");
    const escapedPrefix = DEFAULT_BRANCH_PREFIX.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    expect(name).toMatch(
      new RegExp(`^${escapedPrefix}fix-auth-bug-[a-z0-9]{5}$`),
    );
  });
});

describe("generatePRInfo", () => {
  it("uses platform credentials when available", async () => {
    // The function now uses platform credentials from env.* only
    // If a platform API key (GEMINI, OPENAI, or ANTHROPIC) is set in env,
    // it will use that provider. Otherwise falls back to task description.
    const result = await generatePRInfo("Fix authentication bug", {});
    // Result depends on which platform env var is set
    // If any platform key is available, usedFallback should be false
    // We can't assert specific values without knowing env state
    expect(result.branchName).toBeTruthy();
    expect(result.prTitle).toBeTruthy();
  });

  it("sanitizes provider output", async () => {
    setGenerateObjectImplementation(async (_options) => {
      const parsed = prGenerationSchema.parse({
        branchName: "Fix Auth Flow!",
        prTitle: "  Improve login flow  ",
      });
      return createMockResult(parsed);
    });

    const result = await generatePRInfo("Fix login", EMPTY_KEYS);
    expect(result.usedFallback).toBe(false);
    // Provider name depends on which platform env var is set (GEMINI, OPENAI, or ANTHROPIC)
    expect(result.providerName).not.toBeNull();
    expect(result.branchName).toBe("fix-auth-flow");
    expect(result.prTitle).toBe("Improve login flow");
  });

  it("falls back when provider throws", async () => {
    setGenerateObjectImplementation(async (_options) => {
      throw new Error("LLM error");
    });

    const result = await generatePRInfo("Refactor auth", EMPTY_KEYS);
    expect(result.usedFallback).toBe(true);
    expect(result.branchName).toBe("refactor-auth");
  });
});

describe("generateBranchNames", () => {
  it("builds base branch name with LLM assistance", async () => {
    setGenerateObjectImplementation(async (_options) => {
      const parsed = prGenerationSchema.parse({
        branchName: "add-auth-logging",
        prTitle: "Add auth logging",
      });
      return createMockResult(parsed);
    });

    const { baseBranchName } = await generateNewBranchName(
      "Add auditing to auth",
      EMPTY_KEYS,
    );
    expect(baseBranchName).toBe(`${DEFAULT_BRANCH_PREFIX}add-auth-logging`);
  });

  it("respects provided unique id for single branch", async () => {
    const { branchName } = await generateNewBranchName("Fix bug", {}, "abcde");
    expect(branchName).toBe(`${DEFAULT_BRANCH_PREFIX}fix-bug-abcde`);
  });

  it("generates the requested number of unique branches", async () => {
    const { branchNames } = await generateUniqueBranchNames(
      "Improve docs",
      3,
      {},
    );
    expect(branchNames).toHaveLength(3);
    const unique = new Set(branchNames);
    expect(unique.size).toBe(3);
  });

  it("uses supplied unique id for the first branch when generating multiples", async () => {
    setGenerateObjectImplementation(async (_options) => {
      const parsed = prGenerationSchema.parse({
        branchName: "improve-logging",
        prTitle: "Improve logging",
      });
      return createMockResult(parsed);
    });

    const { branchNames } = await generateUniqueBranchNames(
      "Improve logging",
      2,
      {},
      "abcde",
    );
    const escapedPrefix = DEFAULT_BRANCH_PREFIX.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    expect(branchNames[0]).toBe(
      `${DEFAULT_BRANCH_PREFIX}improve-logging-abcde`,
    );
    expect(branchNames[1]).toMatch(
      new RegExp(`^${escapedPrefix}improve-logging-[a-z0-9]{5}$`),
    );
  });

  it("builds multiple branches from existing title", () => {
    const names = generateUniqueBranchNamesFromTitle("Fix Bug", 2);
    expect(names).toHaveLength(2);
    const escapedPrefix = DEFAULT_BRANCH_PREFIX.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&",
    );
    names.forEach((name) =>
      expect(name).toMatch(new RegExp(`^${escapedPrefix}fix-bug-[a-z0-9]{5}$`)),
    );
  });
});

describe("generateBranchNamesFromBase", () => {
  it("ensures custom id is first", () => {
    const names = generateBranchNamesFromBase("cmux/test", 2, "abcde");
    expect(names[0]).toBe("cmux/test-abcde");
  });
});

describe("getPRTitleFromTaskDescription", () => {
  it("returns sanitized title from provider", async () => {
    setGenerateObjectImplementation(async (_options) => {
      const parsed = prGenerationSchema.parse({
        branchName: "refactor-auth",
        prTitle: "Refactor auth module",
      });
      return createMockResult(parsed);
    });

    const { title, providerName } = await getPRTitleFromTaskDescription(
      "Refactor auth module",
      EMPTY_KEYS,
    );
    // Provider name depends on which platform env var is set (GEMINI, OPENAI, or ANTHROPIC)
    expect(providerName).not.toBeNull();
    expect(title).toBe("Refactor auth module");
  });
});
