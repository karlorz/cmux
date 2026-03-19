import { describe, expect, it } from "vitest";
import { parseComparisonRef, buildComparisonJobDetails } from "./comparison";

describe("parseComparisonRef", () => {
  const defaultInput = {
    defaultOwner: "owner",
    repoName: "repo",
  };

  describe("simple refs (no owner prefix)", () => {
    it("parses branch name", () => {
      const result = parseComparisonRef({ ...defaultInput, raw: "main" });
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        ref: "main",
        label: "main",
      });
    });

    it("parses branch with slashes", () => {
      const result = parseComparisonRef({
        ...defaultInput,
        raw: "feature/add-tests",
      });
      expect(result).toEqual({
        owner: "owner",
        repo: "repo",
        ref: "feature/add-tests",
        label: "feature/add-tests",
      });
    });

    it("trims whitespace", () => {
      const result = parseComparisonRef({ ...defaultInput, raw: "  main  " });
      expect(result.ref).toBe("main");
    });
  });

  describe("refs with owner prefix", () => {
    it("parses owner:ref format", () => {
      const result = parseComparisonRef({
        ...defaultInput,
        raw: "other-owner:feature",
      });
      expect(result).toEqual({
        owner: "other-owner",
        repo: "repo",
        ref: "feature",
        label: "other-owner:feature",
      });
    });

    it("handles colons in ref name", () => {
      const result = parseComparisonRef({
        ...defaultInput,
        raw: "owner:refs/heads/main",
      });
      expect(result.owner).toBe("owner");
      expect(result.ref).toBe("refs/heads/main");
    });

    it("trims owner and ref", () => {
      const result = parseComparisonRef({
        ...defaultInput,
        raw: " owner : branch ",
      });
      expect(result.owner).toBe("owner");
      expect(result.ref).toBe("branch");
    });
  });

  describe("error cases", () => {
    it("throws for empty string", () => {
      expect(() =>
        parseComparisonRef({ ...defaultInput, raw: "" })
      ).toThrow("cannot be empty");
    });

    it("throws for whitespace only", () => {
      expect(() =>
        parseComparisonRef({ ...defaultInput, raw: "   " })
      ).toThrow("cannot be empty");
    });

    it("throws for empty owner", () => {
      expect(() =>
        parseComparisonRef({ ...defaultInput, raw: ":branch" })
      ).toThrow("Invalid comparison ref");
    });

    it("throws for empty ref after colon", () => {
      expect(() =>
        parseComparisonRef({ ...defaultInput, raw: "owner:" })
      ).toThrow("Invalid comparison ref");
    });
  });
});

describe("buildComparisonJobDetails", () => {
  const defaultParams = {
    repoOwner: "myorg",
    repoName: "myrepo",
  };

  it("builds comparison details for simple refs", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "main",
      headRef: "feature",
    });
    expect(result.slug).toBe("main...feature");
    expect(result.repoFullName).toBe("myorg/myrepo");
    expect(result.base.ref).toBe("main");
    expect(result.head.ref).toBe("feature");
  });

  it("builds correct GitHub compare URL", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "main",
      headRef: "feature",
    });
    expect(result.compareUrl).toBe(
      "https://github.com/myorg/myrepo/compare/main...feature"
    );
  });

  it("encodes special characters in URL", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "release/v1.0",
      headRef: "feature/add-tests",
    });
    expect(result.compareUrl).toContain("release%2Fv1.0");
    expect(result.compareUrl).toContain("feature%2Fadd-tests");
  });

  it("handles cross-owner comparison", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "upstream:main",
      headRef: "fork:feature",
    });
    expect(result.base.owner).toBe("upstream");
    expect(result.head.owner).toBe("fork");
    expect(result.slug).toBe("upstream:main...fork:feature");
  });

  it("uses repo owner as default for refs without owner", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "main",
      headRef: "feature",
    });
    expect(result.base.owner).toBe("myorg");
    expect(result.head.owner).toBe("myorg");
  });

  it("preserves repo name in both refs", () => {
    const result = buildComparisonJobDetails({
      ...defaultParams,
      baseRef: "other:main",
      headRef: "feature",
    });
    expect(result.base.repo).toBe("myrepo");
    expect(result.head.repo).toBe("myrepo");
  });
});
