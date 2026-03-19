import { describe, expect, it } from "vitest";
import { DEFAULT_BRANCH_PREFIX, MAX_BRANCH_NAME_LENGTH } from "./git-constants";

describe("DEFAULT_BRANCH_PREFIX", () => {
  it("is dev/", () => {
    expect(DEFAULT_BRANCH_PREFIX).toBe("dev/");
  });

  it("is a string", () => {
    expect(typeof DEFAULT_BRANCH_PREFIX).toBe("string");
  });

  it("ends with slash for clean concatenation", () => {
    expect(DEFAULT_BRANCH_PREFIX.endsWith("/")).toBe(true);
  });

  it("can be used for branch name construction", () => {
    const taskSlug = "fix-login-bug";
    const branchName = `${DEFAULT_BRANCH_PREFIX}${taskSlug}`;
    expect(branchName).toBe("dev/fix-login-bug");
  });
});

describe("MAX_BRANCH_NAME_LENGTH", () => {
  it("is 60", () => {
    expect(MAX_BRANCH_NAME_LENGTH).toBe(60);
  });

  it("is a positive number", () => {
    expect(MAX_BRANCH_NAME_LENGTH).toBeGreaterThan(0);
  });

  it("allows reasonable branch names", () => {
    // Typical branch: "dev/" (4) + slug (30) + "-" (1) + id (8) = 43
    const typicalLength = DEFAULT_BRANCH_PREFIX.length + 30 + 1 + 8;
    expect(typicalLength).toBeLessThanOrEqual(MAX_BRANCH_NAME_LENGTH);
  });

  it("is less than git default limit of 250", () => {
    // Git has a ~250 char limit, but we keep names manageable
    expect(MAX_BRANCH_NAME_LENGTH).toBeLessThan(250);
  });
});
