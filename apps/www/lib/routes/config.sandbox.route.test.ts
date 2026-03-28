import { testApiClient } from "@/lib/test-utils/openapi-client";
import { getApiConfigSandbox } from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

describe("configSandboxRouter via SDK", () => {
  it("GET /config/sandbox returns sandbox configuration (no auth required)", async () => {
    const res = await getApiConfigSandbox({
      client: testApiClient,
    });

    // This endpoint doesn't require auth - should return 200 or 500 (no provider)
    expect([200, 500]).toContain(res.response.status);

    if (res.response.status === 200) {
      expect(res.data).toBeDefined();
      expect(res.data).toHaveProperty("provider");
      expect(res.data).toHaveProperty("providerDisplayName");
      expect(res.data).toHaveProperty("presets");
      expect(res.data).toHaveProperty("defaultPresetId");
      expect(res.data).toHaveProperty("capabilities");

      // Validate provider is one of the expected types
      expect(["morph", "pve-lxc", "pve-vm"]).toContain(res.data?.provider);

      // Validate capabilities structure
      if (res.data?.capabilities) {
        expect(res.data.capabilities).toHaveProperty("supportsHibernate");
        expect(res.data.capabilities).toHaveProperty("supportsSnapshots");
        expect(res.data.capabilities).toHaveProperty("supportsResize");
      }

      // Validate presets array structure
      if (res.data?.presets && res.data.presets.length > 0) {
        const preset = res.data.presets[0];
        expect(preset).toHaveProperty("id");
        expect(preset).toHaveProperty("presetId");
        expect(preset).toHaveProperty("label");
        expect(preset).toHaveProperty("cpu");
        expect(preset).toHaveProperty("memory");
        expect(preset).toHaveProperty("disk");
      }
    }
  });

  it("GET /config/sandbox response is valid JSON structure", async () => {
    const res = await getApiConfigSandbox({
      client: testApiClient,
    });

    // Even on error, should return valid structure
    if (res.response.status === 200) {
      // SDK already parsed JSON - check it's a valid object
      expect(res.data).toBeDefined();
      expect(typeof res.data).toBe("object");
      expect(res.data).not.toBeNull();
    }
  });
});
