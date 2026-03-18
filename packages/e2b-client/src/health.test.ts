import { describe, expect, it, mock, beforeEach, afterEach } from "bun:test";
import { E2BHealthMonitor, type HealthStatus, type HealthCheckResult } from "./health";

describe("E2BHealthMonitor", () => {
  let monitor: E2BHealthMonitor;
  let checkFn: ReturnType<typeof mock>;

  beforeEach(() => {
    checkFn = mock(() => Promise.resolve());
  });

  afterEach(() => {
    if (monitor) {
      monitor.stop();
    }
  });

  describe("initial state", () => {
    it("should start with healthy status", () => {
      monitor = new E2BHealthMonitor(checkFn);
      expect(monitor.getStatus()).toBe("healthy");
    });

    it("should be available initially", () => {
      monitor = new E2BHealthMonitor(checkFn);
      expect(monitor.isAvailable()).toBe(true);
    });

    it("should have zero stats initially", () => {
      monitor = new E2BHealthMonitor(checkFn);
      const stats = monitor.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.totalFailures).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
      expect(stats.consecutiveSuccesses).toBe(0);
      expect(stats.uptime).toBe(100);
    });
  });

  describe("runCheck", () => {
    it("should return healthy status on success", async () => {
      checkFn = mock(() => Promise.resolve());
      monitor = new E2BHealthMonitor(checkFn);

      const result = await monitor.runCheck();

      expect(result.status).toBe("healthy");
      expect(result.latencyMs).toBeGreaterThanOrEqual(0);
      expect(result.error).toBeUndefined();
    });

    it("should return unhealthy status on failure", async () => {
      checkFn = mock(() => Promise.reject(new Error("connection failed")));
      monitor = new E2BHealthMonitor(checkFn);

      const result = await monitor.runCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.error).toBe("connection failed");
    });

    it("should return degraded status on high latency", async () => {
      checkFn = mock(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
      monitor = new E2BHealthMonitor(checkFn, { degradedLatencyMs: 50 });

      const result = await monitor.runCheck();

      expect(result.status).toBe("degraded");
    });

    it("should timeout on slow checks", async () => {
      checkFn = mock(async () => {
        await new Promise((r) => setTimeout(r, 500));
      });
      monitor = new E2BHealthMonitor(checkFn, { checkTimeoutMs: 100 });

      const result = await monitor.runCheck();

      expect(result.status).toBe("unhealthy");
      expect(result.error).toBe("Health check timeout");
    });

    it("should update stats after check", async () => {
      checkFn = mock(() => Promise.resolve());
      monitor = new E2BHealthMonitor(checkFn);

      await monitor.runCheck();
      const stats = monitor.getStats();

      expect(stats.totalChecks).toBe(1);
      expect(stats.consecutiveSuccesses).toBe(1);
      expect(stats.lastCheck).not.toBeNull();
    });
  });

  describe("status transitions", () => {
    it("should transition to degraded after first failure", async () => {
      checkFn = mock(() => Promise.reject(new Error("fail")));
      monitor = new E2BHealthMonitor(checkFn);

      await monitor.runCheck();

      expect(monitor.getStatus()).toBe("degraded");
    });

    it("should transition to unhealthy after threshold failures", async () => {
      checkFn = mock(() => Promise.reject(new Error("fail")));
      monitor = new E2BHealthMonitor(checkFn, { unhealthyThreshold: 3 });

      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("degraded");

      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("degraded");

      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("unhealthy");
    });

    it("should not be available when unhealthy", async () => {
      checkFn = mock(() => Promise.reject(new Error("fail")));
      monitor = new E2BHealthMonitor(checkFn, { unhealthyThreshold: 1 });

      await monitor.runCheck();

      expect(monitor.isAvailable()).toBe(false);
    });

    it("should recover after threshold successes", async () => {
      let shouldFail = true;
      checkFn = mock(() => (shouldFail ? Promise.reject(new Error("fail")) : Promise.resolve()));
      monitor = new E2BHealthMonitor(checkFn, {
        unhealthyThreshold: 1,
        recoveryThreshold: 2,
      });

      // Fail to become unhealthy
      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("unhealthy");

      // Start succeeding
      shouldFail = false;
      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("unhealthy"); // Not recovered yet

      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("healthy"); // Recovered
    });
  });

  describe("status change callback", () => {
    it("should call onStatusChange when status changes", async () => {
      const onStatusChange = mock(
        (_old: HealthStatus, _new: HealthStatus, _result: HealthCheckResult) => {}
      );
      checkFn = mock(() => Promise.reject(new Error("fail")));
      monitor = new E2BHealthMonitor(checkFn, { onStatusChange });

      await monitor.runCheck();

      expect(onStatusChange).toHaveBeenCalledTimes(1);
      expect(onStatusChange.mock.calls[0][0]).toBe("healthy");
      expect(onStatusChange.mock.calls[0][1]).toBe("degraded");
    });

    it("should not call onStatusChange when status unchanged", async () => {
      const onStatusChange = mock(() => {});
      checkFn = mock(() => Promise.resolve());
      monitor = new E2BHealthMonitor(checkFn, { onStatusChange });

      await monitor.runCheck();
      await monitor.runCheck();

      expect(onStatusChange).not.toHaveBeenCalled();
    });
  });

  describe("reset", () => {
    it("should reset all state", async () => {
      checkFn = mock(() => Promise.reject(new Error("fail")));
      monitor = new E2BHealthMonitor(checkFn, { unhealthyThreshold: 1 });

      await monitor.runCheck();
      expect(monitor.getStatus()).toBe("unhealthy");

      monitor.reset();

      expect(monitor.getStatus()).toBe("healthy");
      expect(monitor.isAvailable()).toBe(true);
      const stats = monitor.getStats();
      expect(stats.totalChecks).toBe(0);
      expect(stats.consecutiveFailures).toBe(0);
    });
  });

  describe("getStats", () => {
    it("should calculate average latency correctly", async () => {
      let callCount = 0;
      checkFn = mock(async () => {
        callCount++;
        await new Promise((r) => setTimeout(r, callCount * 10));
      });
      monitor = new E2BHealthMonitor(checkFn);

      await monitor.runCheck();
      await monitor.runCheck();
      await monitor.runCheck();

      const stats = monitor.getStats();
      expect(stats.totalChecks).toBe(3);
      expect(stats.averageLatencyMs).toBeGreaterThan(0);
    });

    it("should calculate uptime percentage", async () => {
      let shouldFail = false;
      checkFn = mock(() => (shouldFail ? Promise.reject(new Error("fail")) : Promise.resolve()));
      monitor = new E2BHealthMonitor(checkFn);

      await monitor.runCheck(); // success
      await monitor.runCheck(); // success
      shouldFail = true;
      await monitor.runCheck(); // fail
      await monitor.runCheck(); // fail

      const stats = monitor.getStats();
      expect(stats.uptime).toBe(50); // 2/4 = 50%
    });
  });

  describe("start/stop", () => {
    it("should start and stop without errors", () => {
      checkFn = mock(() => Promise.resolve());
      monitor = new E2BHealthMonitor(checkFn, { checkIntervalMs: 100 });

      monitor.start();
      expect(() => monitor.start()).not.toThrow(); // Double start is safe

      monitor.stop();
      expect(() => monitor.stop()).not.toThrow(); // Double stop is safe
    });
  });
});
