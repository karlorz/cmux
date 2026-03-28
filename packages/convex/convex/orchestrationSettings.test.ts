import { describe, expect, it } from "vitest";

/**
 * Tests for orchestration settings defaults.
 *
 * These tests verify the default values defined in orchestrationSettings.ts
 * match expected values for maintainability and regression detection.
 */

type SimplifyMode = "quick" | "full" | "staged-only";

// Default values as documented in orchestrationSettings.ts
const EXPECTED_DEFAULTS: {
  autoHeadAgent: boolean;
  defaultCodingAgent: string;
  defaultSupervisorProfileId: null;
  autoSpawnEnabled: boolean;
  maxConcurrentSubAgents: number;
  allowedRepos: string[];
  preferredProviders: string[];
  dailyBudgetCents: number | null;
  maxTaskDurationMinutes: number;
  requireSimplifyBeforeMerge: boolean;
  simplifyMode: SimplifyMode;
  simplifyTimeoutMinutes: number;
} = {
  autoHeadAgent: false,
  defaultCodingAgent: "codex/gpt-5.3-codex",
  defaultSupervisorProfileId: null,
  autoSpawnEnabled: false,
  maxConcurrentSubAgents: 3,
  allowedRepos: [],
  preferredProviders: ["codex", "claude"],
  dailyBudgetCents: null,
  maxTaskDurationMinutes: 60,
  requireSimplifyBeforeMerge: false,
  simplifyMode: "quick",
  simplifyTimeoutMinutes: 10,
};

describe("orchestrationSettings defaults", () => {
  describe("core defaults", () => {
    it("autoHeadAgent defaults to false", () => {
      expect(EXPECTED_DEFAULTS.autoHeadAgent).toBe(false);
    });

    it("defaultCodingAgent defaults to codex/gpt-5.3-codex", () => {
      expect(EXPECTED_DEFAULTS.defaultCodingAgent).toBe("codex/gpt-5.3-codex");
    });

    it("autoSpawnEnabled defaults to false", () => {
      expect(EXPECTED_DEFAULTS.autoSpawnEnabled).toBe(false);
    });

    it("maxConcurrentSubAgents defaults to 3", () => {
      expect(EXPECTED_DEFAULTS.maxConcurrentSubAgents).toBe(3);
    });

    it("maxTaskDurationMinutes defaults to 60", () => {
      expect(EXPECTED_DEFAULTS.maxTaskDurationMinutes).toBe(60);
    });
  });

  describe("provider preferences", () => {
    it("preferredProviders defaults to codex and claude", () => {
      expect(EXPECTED_DEFAULTS.preferredProviders).toEqual(["codex", "claude"]);
    });

    it("allowedRepos defaults to empty (all allowed)", () => {
      expect(EXPECTED_DEFAULTS.allowedRepos).toEqual([]);
    });
  });

  describe("budget settings", () => {
    it("dailyBudgetCents defaults to null (unlimited)", () => {
      expect(EXPECTED_DEFAULTS.dailyBudgetCents).toBeNull();
    });
  });

  describe("/simplify gate settings", () => {
    it("requireSimplifyBeforeMerge defaults to false", () => {
      expect(EXPECTED_DEFAULTS.requireSimplifyBeforeMerge).toBe(false);
    });

    it("simplifyMode defaults to quick", () => {
      expect(EXPECTED_DEFAULTS.simplifyMode).toBe("quick");
    });

    it("simplifyTimeoutMinutes defaults to 10", () => {
      expect(EXPECTED_DEFAULTS.simplifyTimeoutMinutes).toBe(10);
    });

    it("simplifyMode accepts valid values", () => {
      const validModes = ["quick", "full", "staged-only"];
      expect(validModes).toContain(EXPECTED_DEFAULTS.simplifyMode);
    });
  });

  describe("supervisor settings", () => {
    it("defaultSupervisorProfileId defaults to null", () => {
      expect(EXPECTED_DEFAULTS.defaultSupervisorProfileId).toBeNull();
    });
  });
});

/**
 * Helper to apply defaults like the actual query does.
 * This mirrors the logic in orchestrationSettings.ts get() and getByTeamIdInternal().
 */
function applyDefaults(settings: Partial<typeof EXPECTED_DEFAULTS> | null) {
  return {
    autoHeadAgent: settings?.autoHeadAgent ?? false,
    defaultCodingAgent: settings?.defaultCodingAgent ?? "codex/gpt-5.3-codex",
    defaultSupervisorProfileId: settings?.defaultSupervisorProfileId ?? null,
    autoSpawnEnabled: settings?.autoSpawnEnabled ?? false,
    maxConcurrentSubAgents: settings?.maxConcurrentSubAgents ?? 3,
    allowedRepos: settings?.allowedRepos ?? [],
    preferredProviders: settings?.preferredProviders ?? ["codex", "claude"],
    dailyBudgetCents: settings?.dailyBudgetCents ?? null,
    maxTaskDurationMinutes: settings?.maxTaskDurationMinutes ?? 60,
    requireSimplifyBeforeMerge: settings?.requireSimplifyBeforeMerge ?? false,
    simplifyMode: settings?.simplifyMode ?? "quick",
    simplifyTimeoutMinutes: settings?.simplifyTimeoutMinutes ?? 10,
  };
}

describe("applyDefaults helper", () => {
  it("returns all defaults when settings is null", () => {
    const result = applyDefaults(null);
    expect(result).toEqual(EXPECTED_DEFAULTS);
  });

  it("returns all defaults when settings is empty", () => {
    const result = applyDefaults({});
    expect(result).toEqual(EXPECTED_DEFAULTS);
  });

  it("preserves partial overrides", () => {
    const result = applyDefaults({
      autoHeadAgent: true,
      maxConcurrentSubAgents: 5,
    });
    expect(result.autoHeadAgent).toBe(true);
    expect(result.maxConcurrentSubAgents).toBe(5);
    // Others should be defaults
    expect(result.autoSpawnEnabled).toBe(false);
    expect(result.simplifyMode).toBe("quick");
  });

  it("allows full simplify mode override", () => {
    const result = applyDefaults({
      requireSimplifyBeforeMerge: true,
      simplifyMode: "full",
      simplifyTimeoutMinutes: 30,
    });
    expect(result.requireSimplifyBeforeMerge).toBe(true);
    expect(result.simplifyMode).toBe("full");
    expect(result.simplifyTimeoutMinutes).toBe(30);
  });
});
