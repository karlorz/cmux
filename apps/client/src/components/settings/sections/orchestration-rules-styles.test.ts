import { describe, expect, it } from "vitest";
import {
  LANE_LABELS,
  LANE_BADGE_STYLES,
  STATUS_BADGE_STYLES,
  SKILL_STATUS_BADGE_STYLES,
} from "./orchestration-rules-styles";
import type { RuleLane, RuleStatus, SkillStatus } from "./useOrchestrationRules";

const ALL_LANES: RuleLane[] = ["hot", "orchestration", "project"];
const ALL_RULE_STATUSES: RuleStatus[] = ["candidate", "active", "suppressed", "archived"];
const ALL_SKILL_STATUSES: SkillStatus[] = ["candidate", "approved", "extracted", "rejected"];

describe("LANE_LABELS", () => {
  it("has labels for all lanes", () => {
    for (const lane of ALL_LANES) {
      expect(LANE_LABELS[lane]).toBeTruthy();
      expect(typeof LANE_LABELS[lane]).toBe("string");
    }
  });
});

describe("LANE_BADGE_STYLES", () => {
  it("has styles for all lanes", () => {
    for (const lane of ALL_LANES) {
      expect(LANE_BADGE_STYLES[lane]).toBeTruthy();
      expect(LANE_BADGE_STYLES[lane]).toMatch(/bg-/);
    }
  });

  it("includes dark mode classes", () => {
    for (const lane of ALL_LANES) {
      expect(LANE_BADGE_STYLES[lane]).toMatch(/dark:/);
    }
  });
});

describe("STATUS_BADGE_STYLES", () => {
  it("has styles for all rule statuses", () => {
    for (const status of ALL_RULE_STATUSES) {
      expect(STATUS_BADGE_STYLES[status]).toBeTruthy();
      expect(STATUS_BADGE_STYLES[status]).toMatch(/bg-/);
    }
  });
});

describe("SKILL_STATUS_BADGE_STYLES", () => {
  it("has styles for all skill statuses", () => {
    for (const status of ALL_SKILL_STATUSES) {
      expect(SKILL_STATUS_BADGE_STYLES[status]).toBeTruthy();
      expect(SKILL_STATUS_BADGE_STYLES[status]).toMatch(/bg-/);
    }
  });
});
