import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  ALERT_SEVERITY_CONFIG,
  generateAlertId,
  createAlert,
  AlertTemplates,
  type AlertInput,
  type AlertSeverity,
} from "./alerts";

describe("alerts", () => {
  describe("ALERT_SEVERITY_CONFIG", () => {
    it("has config for all severity levels", () => {
      const severities: AlertSeverity[] = ["info", "warning", "error", "critical"];
      for (const severity of severities) {
        expect(ALERT_SEVERITY_CONFIG[severity]).toBeDefined();
      }
    });

    it("info has correct styling", () => {
      const config = ALERT_SEVERITY_CONFIG.info;
      expect(config.label).toBe("Info");
      expect(config.icon).toBe("info");
      expect(config.color).toContain("blue");
      expect(config.bgColor).toContain("blue");
    });

    it("warning has correct styling", () => {
      const config = ALERT_SEVERITY_CONFIG.warning;
      expect(config.label).toBe("Warning");
      expect(config.icon).toBe("alert-triangle");
      expect(config.color).toContain("yellow");
    });

    it("error has correct styling", () => {
      const config = ALERT_SEVERITY_CONFIG.error;
      expect(config.label).toBe("Error");
      expect(config.icon).toBe("x-circle");
      expect(config.color).toContain("red");
    });

    it("critical has correct styling", () => {
      const config = ALERT_SEVERITY_CONFIG.critical;
      expect(config.label).toBe("Critical");
      expect(config.icon).toBe("alert-octagon");
      expect(config.color).toContain("red");
    });

    it("all configs have required fields", () => {
      for (const [severity, config] of Object.entries(ALERT_SEVERITY_CONFIG)) {
        expect(config.label).toBeTruthy();
        expect(config.color).toBeTruthy();
        expect(config.bgColor).toBeTruthy();
        expect(config.borderColor).toBeTruthy();
        expect(config.icon).toBeTruthy();
      }
    });
  });

  describe("generateAlertId", () => {
    it("generates string starting with alert_", () => {
      const id = generateAlertId();
      expect(id).toMatch(/^alert_/);
    });

    it("includes timestamp", () => {
      const before = Date.now();
      const id = generateAlertId();
      const after = Date.now();

      const parts = id.split("_");
      const timestamp = parseInt(parts[1], 10);

      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });

    it("includes random suffix", () => {
      const id = generateAlertId();
      const parts = id.split("_");

      expect(parts[2]).toBeTruthy();
      expect(parts[2].length).toBeGreaterThan(0);
    });

    it("generates unique IDs", () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateAlertId());
      }
      expect(ids.size).toBe(100);
    });
  });

  describe("createAlert", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-22T12:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("creates alert with all input fields", () => {
      const input: AlertInput = {
        severity: "error",
        category: "sandbox",
        title: "Test Alert",
        message: "Test message",
        teamId: "team_123",
      };

      const alert = createAlert(input);

      expect(alert.severity).toBe("error");
      expect(alert.category).toBe("sandbox");
      expect(alert.title).toBe("Test Alert");
      expect(alert.message).toBe("Test message");
      expect(alert.teamId).toBe("team_123");
    });

    it("generates unique ID", () => {
      const input: AlertInput = {
        severity: "info",
        category: "system",
        title: "Test",
        message: "Test",
        teamId: "team_123",
      };

      const alert = createAlert(input);

      expect(alert.id).toMatch(/^alert_/);
    });

    it("sets createdAt to current time", () => {
      const input: AlertInput = {
        severity: "warning",
        category: "provider",
        title: "Test",
        message: "Test",
        teamId: "team_123",
      };

      const alert = createAlert(input);

      expect(alert.createdAt).toBe(Date.now());
    });

    it("includes optional metadata", () => {
      const input: AlertInput = {
        severity: "error",
        category: "orchestration",
        title: "Test",
        message: "Test",
        teamId: "team_123",
        metadata: { taskId: "task_456", errorCode: 500 },
      };

      const alert = createAlert(input);

      expect(alert.metadata).toEqual({ taskId: "task_456", errorCode: 500 });
    });

    it("includes optional userId", () => {
      const input: AlertInput = {
        severity: "info",
        category: "auth",
        title: "Test",
        message: "Test",
        teamId: "team_123",
        userId: "user_456",
      };

      const alert = createAlert(input);

      expect(alert.userId).toBe("user_456");
    });

    it("includes optional traceId", () => {
      const input: AlertInput = {
        severity: "critical",
        category: "system",
        title: "Test",
        message: "Test",
        teamId: "team_123",
        traceId: "trace_789",
      };

      const alert = createAlert(input);

      expect(alert.traceId).toBe("trace_789");
    });

    it("does not set resolvedAt or acknowledgedAt", () => {
      const input: AlertInput = {
        severity: "info",
        category: "system",
        title: "Test",
        message: "Test",
        teamId: "team_123",
      };

      const alert = createAlert(input);

      expect(alert.resolvedAt).toBeUndefined();
      expect(alert.acknowledgedAt).toBeUndefined();
    });
  });

  describe("AlertTemplates", () => {
    describe("sandboxSpawnFailed", () => {
      it("creates error alert for sandbox category", () => {
        const alert = AlertTemplates.sandboxSpawnFailed("team_1", "Connection refused");

        expect(alert.severity).toBe("error");
        expect(alert.category).toBe("sandbox");
        expect(alert.title).toBe("Sandbox spawn failed");
        expect(alert.message).toBe("Connection refused");
        expect(alert.teamId).toBe("team_1");
      });

      it("includes optional metadata", () => {
        const alert = AlertTemplates.sandboxSpawnFailed("team_1", "Error", {
          provider: "morph",
        });

        expect(alert.metadata).toEqual({ provider: "morph" });
      });
    });

    describe("sandboxTimeout", () => {
      it("creates warning alert with timeout details", () => {
        const alert = AlertTemplates.sandboxTimeout("team_1", "sandbox_123", 30);

        expect(alert.severity).toBe("warning");
        expect(alert.category).toBe("sandbox");
        expect(alert.title).toBe("Sandbox timed out");
        expect(alert.message).toContain("sandbox_123");
        expect(alert.message).toContain("30 minute");
        expect(alert.metadata).toEqual({ sandboxId: "sandbox_123", timeoutMinutes: 30 });
      });
    });

    describe("providerDegraded", () => {
      it("creates warning alert with health score", () => {
        const alert = AlertTemplates.providerDegraded("team_1", "Anthropic", 75);

        expect(alert.severity).toBe("warning");
        expect(alert.category).toBe("provider");
        expect(alert.title).toContain("Anthropic");
        expect(alert.message).toContain("75%");
        expect(alert.metadata).toEqual({ providerName: "Anthropic", healthScore: 75 });
      });
    });

    describe("providerDown", () => {
      it("creates critical alert for provider outage", () => {
        const alert = AlertTemplates.providerDown("team_1", "OpenAI");

        expect(alert.severity).toBe("critical");
        expect(alert.category).toBe("provider");
        expect(alert.title).toContain("OpenAI");
        expect(alert.message).toContain("not responding");
        expect(alert.metadata).toEqual({ providerName: "OpenAI" });
      });
    });

    describe("orchestrationTaskFailed", () => {
      it("creates error alert with task ID", () => {
        const alert = AlertTemplates.orchestrationTaskFailed(
          "team_1",
          "task_456",
          "Task exceeded max retries"
        );

        expect(alert.severity).toBe("error");
        expect(alert.category).toBe("orchestration");
        expect(alert.message).toBe("Task exceeded max retries");
        expect(alert.metadata).toEqual({ taskId: "task_456" });
      });
    });

    describe("authTokenExpired", () => {
      it("creates warning alert for auth expiry", () => {
        const alert = AlertTemplates.authTokenExpired("team_1", "GitHub");

        expect(alert.severity).toBe("warning");
        expect(alert.category).toBe("auth");
        expect(alert.title).toContain("GitHub");
        expect(alert.message).toContain("expired");
        expect(alert.metadata).toEqual({ provider: "GitHub" });
      });
    });

    describe("slaViolation", () => {
      it("creates warning alert with SLA details", () => {
        const alert = AlertTemplates.slaViolation("team_1", "p95 latency", 500, 750);

        expect(alert.severity).toBe("warning");
        expect(alert.category).toBe("system");
        expect(alert.title).toContain("p95 latency");
        expect(alert.message).toContain("500ms");
        expect(alert.message).toContain("750ms");
        expect(alert.metadata).toEqual({
          metric: "p95 latency",
          threshold: 500,
          actual: 750,
        });
      });
    });
  });
});
