import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  calculateFreshnessScore,
  generateHealthRecommendations,
} from "./agentMemoryFreshness";

describe("agentMemoryFreshness", () => {
  describe("calculateFreshnessScore", () => {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const HALF_LIFE_DAYS = 30;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    describe("base decay", () => {
      it("returns ~1.0 for brand new entry with no usage", () => {
        const now = Date.now();
        const score = calculateFreshnessScore(now, undefined, 0);
        expect(score).toBeCloseTo(1.0, 1);
      });

      it("returns ~0.5 after half-life period (30 days)", () => {
        const now = Date.now();
        const thirtyDaysAgo = now - HALF_LIFE_DAYS * ONE_DAY_MS;
        const score = calculateFreshnessScore(thirtyDaysAgo, undefined, 0);
        expect(score).toBeCloseTo(0.5, 1);
      });

      it("returns ~0.25 after two half-life periods (60 days)", () => {
        const now = Date.now();
        const sixtyDaysAgo = now - 60 * ONE_DAY_MS;
        const score = calculateFreshnessScore(sixtyDaysAgo, undefined, 0);
        expect(score).toBeCloseTo(0.25, 1);
      });

      it("returns minimum score (0.1) for very old entries", () => {
        const now = Date.now();
        const veryOld = now - 365 * ONE_DAY_MS; // 1 year old
        const score = calculateFreshnessScore(veryOld, undefined, 0);
        expect(score).toBe(0.1); // Clamped to MIN_FRESHNESS_SCORE
      });
    });

    describe("usage boost", () => {
      it("boosts score by 10% per usage on older entries", () => {
        const now = Date.now();
        // Use older entry so score isn't clamped to 1.0
        const thirtyDaysAgo = now - HALF_LIFE_DAYS * ONE_DAY_MS;

        const scoreNoUsage = calculateFreshnessScore(thirtyDaysAgo, undefined, 0);
        const scoreOneUsage = calculateFreshnessScore(thirtyDaysAgo, undefined, 1);
        const scoreFiveUsage = calculateFreshnessScore(thirtyDaysAgo, undefined, 5);

        expect(scoreOneUsage).toBeGreaterThan(scoreNoUsage);
        expect(scoreFiveUsage).toBeGreaterThan(scoreOneUsage);
        // 1 use = 1.1x, 5 uses = 1.5x
        expect(scoreOneUsage / scoreNoUsage).toBeCloseTo(1.1, 1);
        expect(scoreFiveUsage / scoreNoUsage).toBeCloseTo(1.5, 1);
      });

      it("caps usage boost at 2x (10 uses)", () => {
        const now = Date.now();
        const scoreTenUsage = calculateFreshnessScore(now, undefined, 10);
        const scoreTwentyUsage = calculateFreshnessScore(now, undefined, 20);

        // Both should be capped at 2x
        expect(scoreTenUsage).toBeCloseTo(scoreTwentyUsage, 2);
      });

      it("high usage can recover old entries", () => {
        const now = Date.now();
        const thirtyDaysAgo = now - HALF_LIFE_DAYS * ONE_DAY_MS;

        const scoreNoUsage = calculateFreshnessScore(thirtyDaysAgo, undefined, 0);
        const scoreHighUsage = calculateFreshnessScore(thirtyDaysAgo, undefined, 10);

        // High usage should significantly boost the score
        expect(scoreHighUsage).toBeGreaterThan(scoreNoUsage * 1.5);
      });
    });

    describe("recency boost", () => {
      it("gives significant boost for usage within last week", () => {
        const now = Date.now();
        const createdAt = now - 15 * ONE_DAY_MS; // 15 days old
        const usedRecently = now - 3 * ONE_DAY_MS; // Used 3 days ago

        // Compare with same usage count to isolate recency boost
        const scoreNotUsed = calculateFreshnessScore(createdAt, undefined, 0);
        const scoreUsedRecently = calculateFreshnessScore(createdAt, usedRecently, 0);

        expect(scoreUsedRecently).toBeGreaterThan(scoreNotUsed);
        // Recency boost should be between 1.3x and 1.6x
        const ratio = scoreUsedRecently / scoreNotUsed;
        expect(ratio).toBeGreaterThan(1.3);
        expect(ratio).toBeLessThan(1.6);
      });

      it("gives 1.2x boost for usage within last month", () => {
        const now = Date.now();
        const createdAt = now - 45 * ONE_DAY_MS; // 45 days old
        const usedInMonth = now - 15 * ONE_DAY_MS; // Used 15 days ago

        const scoreNotUsed = calculateFreshnessScore(createdAt, undefined, 1);
        const scoreUsedInMonth = calculateFreshnessScore(createdAt, usedInMonth, 1);

        expect(scoreUsedInMonth).toBeGreaterThan(scoreNotUsed);
        expect(scoreUsedInMonth / scoreNotUsed).toBeCloseTo(1.2, 1);
      });

      it("gives no boost for usage older than 30 days", () => {
        const now = Date.now();
        const createdAt = now - 60 * ONE_DAY_MS;
        const usedLongAgo = now - 45 * ONE_DAY_MS; // Used 45 days ago

        const scoreNotUsed = calculateFreshnessScore(createdAt, undefined, 1);
        const scoreUsedLongAgo = calculateFreshnessScore(createdAt, usedLongAgo, 1);

        // Should be roughly equal (no recency boost)
        expect(scoreUsedLongAgo).toBeCloseTo(scoreNotUsed, 1);
      });
    });

    describe("combined factors", () => {
      it("combines decay, usage, and recency multiplicatively", () => {
        const now = Date.now();
        const fifteenDaysAgo = now - 15 * ONE_DAY_MS;
        const usedRecently = now - 2 * ONE_DAY_MS;

        // Base decay at 15 days: ~0.7 (approximately)
        // Usage boost with 5 uses: 1.5x
        // Recency boost: 1.5x
        const score = calculateFreshnessScore(fifteenDaysAgo, usedRecently, 5);

        expect(score).toBeGreaterThan(0.5);
        expect(score).toBeLessThanOrEqual(1.0);
      });

      it("clamps maximum score to 1.0", () => {
        const now = Date.now();
        // Brand new, just used, high usage count
        const score = calculateFreshnessScore(now, now, 20);
        expect(score).toBeLessThanOrEqual(1.0);
      });

      it("clamps minimum score to 0.1", () => {
        const now = Date.now();
        const veryOld = now - 500 * ONE_DAY_MS;
        const score = calculateFreshnessScore(veryOld, undefined, 0);
        expect(score).toBe(0.1);
      });
    });
  });

  describe("generateHealthRecommendations", () => {
    it("returns positive message when health is good", () => {
      const byType = {
        knowledge: { count: 10, fresh: 8, stale: 0, avgFreshness: 0.8 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.8);

      expect(recommendations).toContain("Memory health looks good!");
    });

    it("recommends pruning when overall health is low", () => {
      const byType = {
        knowledge: { count: 10, fresh: 2, stale: 5, avgFreshness: 0.3 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.3);

      expect(recommendations.some((r) => r.includes("pruneStaleEntries"))).toBe(true);
    });

    it("warns about stale entries when > 30% are stale", () => {
      const byType = {
        tasks: { count: 10, fresh: 3, stale: 5, avgFreshness: 0.4 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.6);

      expect(recommendations.some((r) => r.includes("tasks") && r.includes("stale"))).toBe(true);
    });

    it("suggests archiving old daily logs when count > 90", () => {
      const byType = {
        daily: { count: 120, fresh: 30, stale: 20, avgFreshness: 0.5 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.6);

      expect(recommendations.some((r) => r.includes("120 daily logs") && r.includes("archiving"))).toBe(true);
    });

    it("does not suggest archiving daily logs when count <= 90", () => {
      const byType = {
        daily: { count: 60, fresh: 40, stale: 5, avgFreshness: 0.7 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.7);

      expect(recommendations.some((r) => r.includes("daily logs") && r.includes("archiving"))).toBe(false);
    });

    it("combines multiple recommendations", () => {
      const byType = {
        knowledge: { count: 10, fresh: 2, stale: 5, avgFreshness: 0.3 },
        daily: { count: 150, fresh: 30, stale: 30, avgFreshness: 0.4 },
        tasks: { count: 20, fresh: 5, stale: 10, avgFreshness: 0.3 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.35);

      // Should have multiple recommendations
      expect(recommendations.length).toBeGreaterThan(1);
      // Should recommend pruning
      expect(recommendations.some((r) => r.includes("pruneStaleEntries"))).toBe(true);
      // Should warn about daily logs
      expect(recommendations.some((r) => r.includes("daily logs"))).toBe(true);
    });

    it("handles empty byType object", () => {
      const byType = {};
      const recommendations = generateHealthRecommendations(byType, 1.0);

      expect(recommendations).toContain("Memory health looks good!");
    });

    it("calculates correct percentage for stale entries", () => {
      const byType = {
        mailbox: { count: 100, fresh: 20, stale: 50, avgFreshness: 0.3 },
      };
      const recommendations = generateHealthRecommendations(byType, 0.6);

      // 50/100 = 50%
      expect(recommendations.some((r) => r.includes("50%"))).toBe(true);
    });
  });
});
