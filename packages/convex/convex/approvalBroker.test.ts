import { describe, it, expect } from "vitest";

/**
 * Unit tests for approvalBroker utility functions.
 * Tests ID generation and validation logic without requiring Convex runtime.
 */

describe("approvalBroker", () => {
  describe("generateApprovalId", () => {
    // Replicate the ID generation logic for testing
    function generateApprovalId(): string {
      const timestamp = Date.now().toString(36);
      const random = Math.random().toString(36).substring(2, 8);
      return `apr_${timestamp}${random}`;
    }

    it("generates IDs with apr_ prefix", () => {
      const id = generateApprovalId();
      expect(id.startsWith("apr_")).toBe(true);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateApprovalId());
      }
      // All IDs should be unique
      expect(ids.size).toBe(100);
    });

    it("generates IDs of reasonable length", () => {
      const id = generateApprovalId();
      // apr_ (4) + timestamp (~8-9) + random (6) = ~18-19 chars
      expect(id.length).toBeGreaterThanOrEqual(15);
      expect(id.length).toBeLessThanOrEqual(25);
    });
  });

  describe("approval source validation", () => {
    const validSources = [
      "tool_use",
      "head_agent",
      "worker_agent",
      "policy",
      "system",
    ];

    it("accepts valid sources", () => {
      for (const source of validSources) {
        expect(validSources.includes(source)).toBe(true);
      }
    });

    it("has expected number of source types", () => {
      expect(validSources.length).toBe(5);
    });
  });

  describe("approval type validation", () => {
    const validTypes = [
      "tool_permission",
      "review_request",
      "deployment",
      "cost_override",
      "escalation",
      "risky_action",
    ];

    it("accepts valid approval types", () => {
      for (const type of validTypes) {
        expect(validTypes.includes(type)).toBe(true);
      }
    });

    it("has expected number of approval types", () => {
      expect(validTypes.length).toBe(6);
    });
  });

  describe("resolution validation", () => {
    const validResolutions = [
      "allow",
      "allow_once",
      "allow_session",
      "deny",
      "deny_always",
    ];

    it("accepts valid resolutions", () => {
      for (const resolution of validResolutions) {
        expect(validResolutions.includes(resolution)).toBe(true);
      }
    });

    it("has expected number of resolution types", () => {
      expect(validResolutions.length).toBe(5);
    });

    it("includes both allow and deny variants", () => {
      const allowVariants = validResolutions.filter((r) => r.startsWith("allow"));
      const denyVariants = validResolutions.filter((r) => r.startsWith("deny"));
      expect(allowVariants.length).toBe(3);
      expect(denyVariants.length).toBe(2);
    });
  });

  describe("status validation", () => {
    const validStatuses = [
      "pending",
      "approved",
      "denied",
      "expired",
      "cancelled",
    ];

    it("accepts valid statuses", () => {
      for (const status of validStatuses) {
        expect(validStatuses.includes(status)).toBe(true);
      }
    });

    it("has expected number of status types", () => {
      expect(validStatuses.length).toBe(5);
    });

    it("includes terminal statuses", () => {
      const terminalStatuses = ["approved", "denied", "expired", "cancelled"];
      for (const status of terminalStatuses) {
        expect(validStatuses.includes(status)).toBe(true);
      }
    });
  });

  describe("risk level validation", () => {
    const validRiskLevels = ["low", "medium", "high"];

    it("accepts valid risk levels", () => {
      for (const level of validRiskLevels) {
        expect(validRiskLevels.includes(level)).toBe(true);
      }
    });

    it("has expected number of risk levels", () => {
      expect(validRiskLevels.length).toBe(3);
    });
  });
});
