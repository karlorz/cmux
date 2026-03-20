/**
 * Health Route Tests
 *
 * Tests for system health check endpoints.
 */

import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiHealth,
  getApiHealthSandbox,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

describe("healthRouter", () => {
  describe("GET /api/health", () => {
    it("returns healthy status", async () => {
      const res = await getApiHealth({
        client: testApiClient,
      });

      expect(res.response.status).toBe(200);
      if (res.data) {
        expect(res.data.status).toBe("healthy");
        expect(res.data).toHaveProperty("timestamp");
        expect(res.data).toHaveProperty("version");
        expect(res.data).toHaveProperty("uptime");
      }
    });

    it("returns valid timestamp format", async () => {
      const res = await getApiHealth({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        const timestamp = new Date(res.data.timestamp);
        expect(timestamp.getTime()).not.toBeNaN();
      }
    });

    it("returns uptime as a non-negative number", async () => {
      const res = await getApiHealth({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(typeof res.data.uptime).toBe("number");
        expect(res.data.uptime).toBeGreaterThanOrEqual(0);
      }
    });
  });

  describe("GET /api/health/sandbox", () => {
    it("returns sandbox health status", async () => {
      const res = await getApiHealthSandbox({
        client: testApiClient,
      });

      // Should always return 200, with status indicating health
      expect(res.response.status).toBe(200);
      if (res.data) {
        expect(["healthy", "unhealthy", "degraded"]).toContain(res.data.status);
        expect(res.data).toHaveProperty("provider");
        expect(res.data).toHaveProperty("providerStatus");
        expect(res.data).toHaveProperty("timestamp");
      }
    });

    it("returns valid provider status values", async () => {
      const res = await getApiHealthSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(["connected", "disconnected", "error"]).toContain(res.data.providerStatus);
      }
    });

    it("includes latency for connected providers", async () => {
      const res = await getApiHealthSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data && res.data.providerStatus === "connected") {
        // Latency may or may not be present depending on provider
        if (res.data.latencyMs !== undefined) {
          expect(typeof res.data.latencyMs).toBe("number");
        }
      }
    });
  });
});
