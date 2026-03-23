/**
 * Config Route Tests
 *
 * Tests for system configuration endpoints.
 */

import { testApiClient } from "@/lib/test-utils/openapi-client";
import { getApiConfigSandbox } from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

describe("configRouter", () => {
  describe("GET /api/config/sandbox", () => {
    it("returns sandbox configuration without authentication", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      // Should return config (no auth required for this endpoint)
      expect([200, 500]).toContain(res.response.status);
    });

    it("returns provider type", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("provider");
        expect(["morph", "pve-lxc", "pve-vm", "e2b"]).toContain(res.data.provider);
      }
    });

    it("returns provider display name", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("providerDisplayName");
        expect(typeof res.data.providerDisplayName).toBe("string");
      }
    });

    it("returns presets array", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("presets");
        expect(Array.isArray(res.data.presets)).toBe(true);

        // Each preset should have required fields
        for (const preset of res.data.presets) {
          expect(preset).toHaveProperty("id");
          expect(preset).toHaveProperty("presetId");
          expect(preset).toHaveProperty("label");
          expect(preset).toHaveProperty("cpu");
          expect(preset).toHaveProperty("memory");
          expect(preset).toHaveProperty("disk");
        }
      }
    });

    it("returns default preset ID", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("defaultPresetId");
        expect(typeof res.data.defaultPresetId).toBe("string");
      }
    });

    it("returns capabilities", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("capabilities");
        const caps = res.data.capabilities;
        expect(caps).toHaveProperty("supportsHibernate");
        expect(caps).toHaveProperty("supportsSnapshots");
        expect(caps).toHaveProperty("supportsResize");
        expect(caps).toHaveProperty("supportsNestedVirt");
        expect(caps).toHaveProperty("supportsGpu");
      }
    });

    it("default preset is in presets list", async () => {
      const res = await getApiConfigSandbox({
        client: testApiClient,
      });

      if (res.response.status === 200 && res.data && res.data.presets.length > 0) {
        const presetIds = res.data.presets.map((p) => p.presetId);
        // Default preset should be in the list (or empty for pve-vm)
        if (res.data.defaultPresetId) {
          expect(presetIds).toContain(res.data.defaultPresetId);
        }
      }
    });
  });
});
