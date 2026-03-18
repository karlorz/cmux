import { describe, expect, it } from "vitest";
import {
  isScopeMoreSpecific,
  generateRuleId,
  SCOPE_PRIORITY,
  CATEGORY_CONFIG,
} from "./agent-policy";

describe("isScopeMoreSpecific", () => {
  describe("system scope (broadest)", () => {
    it("system is not more specific than system", () => {
      expect(isScopeMoreSpecific("system", "system")).toBe(false);
    });

    it("system is not more specific than team", () => {
      expect(isScopeMoreSpecific("system", "team")).toBe(false);
    });

    it("system is not more specific than workspace", () => {
      expect(isScopeMoreSpecific("system", "workspace")).toBe(false);
    });

    it("system is not more specific than user", () => {
      expect(isScopeMoreSpecific("system", "user")).toBe(false);
    });
  });

  describe("team scope", () => {
    it("team is more specific than system", () => {
      expect(isScopeMoreSpecific("team", "system")).toBe(true);
    });

    it("team is not more specific than team", () => {
      expect(isScopeMoreSpecific("team", "team")).toBe(false);
    });

    it("team is not more specific than workspace", () => {
      expect(isScopeMoreSpecific("team", "workspace")).toBe(false);
    });
  });

  describe("workspace scope", () => {
    it("workspace is more specific than system", () => {
      expect(isScopeMoreSpecific("workspace", "system")).toBe(true);
    });

    it("workspace is more specific than team", () => {
      expect(isScopeMoreSpecific("workspace", "team")).toBe(true);
    });

    it("workspace is not more specific than user", () => {
      expect(isScopeMoreSpecific("workspace", "user")).toBe(false);
    });
  });

  describe("user scope (most specific)", () => {
    it("user is more specific than system", () => {
      expect(isScopeMoreSpecific("user", "system")).toBe(true);
    });

    it("user is more specific than team", () => {
      expect(isScopeMoreSpecific("user", "team")).toBe(true);
    });

    it("user is more specific than workspace", () => {
      expect(isScopeMoreSpecific("user", "workspace")).toBe(true);
    });

    it("user is not more specific than user", () => {
      expect(isScopeMoreSpecific("user", "user")).toBe(false);
    });
  });
});

describe("generateRuleId", () => {
  it("generates IDs with apr_ prefix", () => {
    const id = generateRuleId();
    expect(id.startsWith("apr_")).toBe(true);
  });

  it("generates IDs with correct length (apr_ + 12 chars)", () => {
    const id = generateRuleId();
    expect(id.length).toBe(16); // 4 (apr_) + 12
  });

  it("generates IDs with valid characters", () => {
    const id = generateRuleId();
    const suffix = id.slice(4);
    expect(suffix).toMatch(/^[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRuleId());
    }
    expect(ids.size).toBe(100);
  });
});

describe("SCOPE_PRIORITY", () => {
  it("has system as first (broadest) scope", () => {
    expect(SCOPE_PRIORITY[0]).toBe("system");
  });

  it("has user as last (most specific) scope", () => {
    expect(SCOPE_PRIORITY[SCOPE_PRIORITY.length - 1]).toBe("user");
  });

  it("maintains correct hierarchy order", () => {
    expect(SCOPE_PRIORITY).toEqual(["system", "team", "workspace", "user"]);
  });
});

describe("CATEGORY_CONFIG", () => {
  it("has all expected categories", () => {
    const categories = Object.keys(CATEGORY_CONFIG);
    expect(categories).toContain("git_policy");
    expect(categories).toContain("security");
    expect(categories).toContain("workflow");
    expect(categories).toContain("tool_restriction");
    expect(categories).toContain("custom");
  });

  it("each category has label and order", () => {
    for (const [_key, config] of Object.entries(CATEGORY_CONFIG)) {
      expect(typeof config.label).toBe("string");
      expect(typeof config.order).toBe("number");
    }
  });

  it("git_policy is first in order", () => {
    expect(CATEGORY_CONFIG.git_policy.order).toBe(1);
  });

  it("custom is last in order", () => {
    expect(CATEGORY_CONFIG.custom.order).toBe(5);
  });
});
