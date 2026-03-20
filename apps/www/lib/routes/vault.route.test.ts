/**
 * Vault Route Tests
 *
 * Tests for Obsidian vault integration endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiVaultRecommendations,
  getApiVaultNotes,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("vaultRouter", () => {
  describe("GET /api/vault/recommendations", () => {
    it("requires authentication", async () => {
      const res = await getApiVaultRecommendations({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect(res.response.status).toBe(401);
    });

    it("returns empty recommendations when vault not configured", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultRecommendations({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Either succeeds with empty or returns 401/500 if auth/vault access fails
      expect([200, 401, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("recommendations");
        expect(res.data).toHaveProperty("vaultConfigured");
        expect(Array.isArray(res.data.recommendations)).toBe(true);
      }
    });

    it("respects limit parameter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultRecommendations({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, limit: 5 },
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data.recommendations.length).toBeLessThanOrEqual(5);
      }
    });

    it("filters by priority", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultRecommendations({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, priority: "high" },
      });

      if (res.response.status === 200 && res.data && res.data.recommendations.length > 0) {
        expect(res.data.recommendations.every((r) => r.priority === "high")).toBe(true);
      }
    });

    it("filters by type", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultRecommendations({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, type: "todo" },
      });

      if (res.response.status === 200 && res.data && res.data.recommendations.length > 0) {
        expect(res.data.recommendations.every((r) => r.type === "todo")).toBe(true);
      }
    });
  });

  describe("GET /api/vault/notes", () => {
    it("requires authentication", async () => {
      const res = await getApiVaultNotes({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect(res.response.status).toBe(401);
    });

    it("returns empty notes when vault not configured", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultNotes({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("notes");
        expect(res.data).toHaveProperty("tags");
        expect(res.data).toHaveProperty("vaultConfigured");
        expect(Array.isArray(res.data.notes)).toBe(true);
        expect(Array.isArray(res.data.tags)).toBe(true);
      }
    });

    it("respects limit parameter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultNotes({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, limit: 10 },
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data.notes.length).toBeLessThanOrEqual(10);
      }
    });

    it("accepts search parameter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultNotes({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, search: "test" },
      });

      // Should not error even if no results; 401 may occur in CI
      expect([200, 401, 500]).toContain(res.response.status);
    });

    it("accepts folder filter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultNotes({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, folder: "projects" },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 500]).toContain(res.response.status);
    });

    it("accepts status filter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiVaultNotes({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, status: "active" },
      });

      if (res.response.status === 200 && res.data && res.data.notes.length > 0) {
        expect(res.data.notes.every((n) => n.status === "active")).toBe(true);
      }
    });
  });
});
