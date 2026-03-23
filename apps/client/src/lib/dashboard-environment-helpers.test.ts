import { describe, it, expect } from "vitest";
import {
  resolveSelectedEnvironment,
  isEnvironmentSelection,
  type EnvironmentData,
} from "./dashboard-environment-helpers";
import type { Id } from "@cmux/convex/dataModel";

const makeEnv = (
  id: string,
  name: string,
  repos: string[] = []
): EnvironmentData => ({
  _id: id as Id<"environments">,
  name,
  selectedRepos: repos,
});

describe("resolveSelectedEnvironment", () => {
  const environments: EnvironmentData[] = [
    makeEnv("env1", "testing-repo-1-2026-03-23", ["owner/repo1"]),
    makeEnv("env2", "prod-environment", ["owner/repo2", "owner/repo3"]),
  ];

  it("resolves environment name and repos when env: prefix is present", () => {
    const result = resolveSelectedEnvironment("env:env1", environments);
    expect(result.name).toBe("testing-repo-1-2026-03-23");
    expect(result.repos).toEqual(["owner/repo1"]);
    expect(result.environmentId).toBe("env1");
  });

  it("resolves environment with multiple repos and deduplicates", () => {
    const envsWithDupes: EnvironmentData[] = [
      makeEnv("env3", "multi-repo", ["a/b", "a/b", "c/d"]),
    ];
    const result = resolveSelectedEnvironment("env:env3", envsWithDupes);
    expect(result.repos).toEqual(["a/b", "c/d"]);
  });

  it("returns null name when environment not found in list", () => {
    const result = resolveSelectedEnvironment("env:unknown", environments);
    expect(result.name).toBeNull();
    expect(result.repos).toEqual([]);
    expect(result.environmentId).toBe("unknown");
  });

  it("returns null for repo selection (no env: prefix)", () => {
    const result = resolveSelectedEnvironment("owner/repo", environments);
    expect(result.name).toBeNull();
    expect(result.repos).toEqual([]);
    expect(result.environmentId).toBeNull();
  });

  it("returns null for undefined selection", () => {
    const result = resolveSelectedEnvironment(undefined, environments);
    expect(result.name).toBeNull();
    expect(result.repos).toEqual([]);
    expect(result.environmentId).toBeNull();
  });

  it("returns null name when environments list is undefined", () => {
    const result = resolveSelectedEnvironment("env:env1", undefined);
    expect(result.name).toBeNull();
    expect(result.repos).toEqual([]);
    expect(result.environmentId).toBe("env1");
  });

  it("returns empty repos when environment has no selectedRepos", () => {
    const envsWithoutRepos: EnvironmentData[] = [
      { _id: "env4" as Id<"environments">, name: "empty-env" },
    ];
    const result = resolveSelectedEnvironment("env:env4", envsWithoutRepos);
    expect(result.name).toBe("empty-env");
    expect(result.repos).toEqual([]);
  });
});

describe("isEnvironmentSelection", () => {
  it("returns true for env: prefix", () => {
    expect(isEnvironmentSelection("env:abc123")).toBe(true);
  });

  it("returns false for repo selection", () => {
    expect(isEnvironmentSelection("owner/repo")).toBe(false);
  });

  it("returns false for undefined", () => {
    expect(isEnvironmentSelection(undefined)).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isEnvironmentSelection("")).toBe(false);
  });
});
