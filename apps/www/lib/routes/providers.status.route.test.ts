import { testApiClient } from "@/lib/test-utils/openapi-client";
import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { getApiProvidersStatus } from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("providersStatusRouter via SDK", () => {
  describe("authentication", () => {
    it("GET /providers/status rejects unauthenticated requests", async () => {
      const res = await getApiProvidersStatus({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });
      expect(res.response.status).toBe(401);
    });
  });

  // Skip authenticated tests - require live Stack Auth credentials
  // Run manually with: CMUX_TEST_TEAM_SLUG=<team> bun run test providers.status.route.test.ts
  describe.skip("authenticated requests (requires live Stack Auth)", () => {
    it(
      "GET /providers/status returns provider list for authenticated user",
      { timeout: 60_000 },
      async () => {
        const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
        const res = await getApiProvidersStatus({
          client: testApiClient,
          query: { teamSlugOrId: TEST_TEAM },
          headers: { "x-stack-auth": JSON.stringify(tokens) },
        });

        // Should return 200 with providers array, never null
        expect(res.response.status).toBe(200);
        expect(res.data).toBeDefined();
        expect(res.data).not.toBeNull();
        expect(res.data).toHaveProperty("providers");
        expect(Array.isArray(res.data?.providers)).toBe(true);

        // Each provider should have required fields
        if (res.data?.providers && res.data.providers.length > 0) {
          const provider = res.data.providers[0];
          expect(provider).toHaveProperty("id");
          expect(provider).toHaveProperty("name");
          expect(provider).toHaveProperty("isAvailable");
          expect(provider).toHaveProperty("requiredKeys");
        }
      }
    );

    it(
      "GET /providers/status returns consistent schema shape (never null)",
      { timeout: 60_000 },
      async () => {
        const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
        const res = await getApiProvidersStatus({
          client: testApiClient,
          query: { teamSlugOrId: TEST_TEAM },
          headers: { "x-stack-auth": JSON.stringify(tokens) },
        });

        expect(res.response.status).toBe(200);

        // Validate response is never literal null (dashboard audit regression check)
        const rawText = await res.response.clone().text();
        expect(rawText).not.toBe("null");
        expect(rawText.trim()).not.toBe("");
      }
    );
  });
});
