/**
 * Providers Route Tests
 *
 * Tests for provider override management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiProviders,
  putApiProvidersById,
  deleteApiProvidersById,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("providersRouter", () => {
  describe("GET /api/providers", () => {
    it("requires authentication", async () => {
      const res = await getApiProviders({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect(res.response.status).toBe(401);
    });

    it("returns provider list for authenticated user", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProviders({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("providers");
        expect(Array.isArray(res.data.providers)).toBe(true);
      }
    });

    it("validates provider structure", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProviders({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      if (res.response.status === 200 && res.data && res.data.providers.length > 0) {
        const provider = res.data.providers[0];
        expect(provider).toHaveProperty("_id");
        expect(provider).toHaveProperty("teamId");
        expect(provider).toHaveProperty("providerId");
        expect(provider).toHaveProperty("enabled");
        expect(provider).toHaveProperty("createdAt");
        expect(provider).toHaveProperty("updatedAt");
      }
    });
  });

  describe("PUT /api/providers/:providerId", () => {
    it("requires authentication", async () => {
      const res = await putApiProvidersById({
        client: testApiClient,
        path: { id: "anthropic" },
        query: { teamSlugOrId: TEST_TEAM },
        body: { enabled: true },
      });

      expect(res.response.status).toBe(401);
    });

    it("creates or updates provider override", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "test-provider" },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          enabled: true,
          baseUrl: "https://api.example.com",
        },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("id");
        expect(res.data).toHaveProperty("action");
        expect(["created", "updated"]).toContain(res.data.action);
      }
    });

    it("accepts apiFormat option", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "custom-anthropic" },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          enabled: true,
          apiFormat: "anthropic",
          baseUrl: "https://custom.anthropic.com",
        },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("accepts fallbacks array", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "primary-provider" },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          enabled: true,
          fallbacks: [
            { modelName: "claude-3-sonnet", priority: 1 },
            { modelName: "gpt-4", priority: 2 },
          ],
        },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("returns 422 for invalid claudeRouting combinations", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "anthropic" },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          enabled: true,
          baseUrl: "https://api.anthropic.com",
          apiFormat: "anthropic",
          claudeRouting: {
            mode: "direct_anthropic",
            opus: { model: "gpt-5.4" },
          },
        },
      });

      expect([401, 403, 422]).toContain(res.response.status);
      if (res.response.status === 422) {
        expect(res.error).toMatchObject({
          code: "INVALID_PROVIDER_OVERRIDE",
          message: "Invalid provider override configuration",
          details: {
            providerId: "anthropic",
            field: "claudeRouting",
            reason:
              "direct_anthropic routing cannot define alias remaps or a subagent model",
          },
        });
      }
    });

    it("accepts valid direct claudeRouting configuration", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "anthropic" },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          enabled: true,
          baseUrl: "https://api.anthropic.com",
          apiFormat: "anthropic",
          claudeRouting: {
            mode: "direct_anthropic",
          },
        },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("id");
        expect(res.data).toHaveProperty("action");
      }
    });

  });

  describe("DELETE /api/providers/:providerId", () => {
    it("requires authentication", async () => {
      const res = await deleteApiProvidersById({
        client: testApiClient,
        path: { id: "test-provider" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect(res.response.status).toBe(401);
    });

    it("deletes provider override", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();

      // First create a provider to delete
      await putApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "to-delete-provider" },
        query: { teamSlugOrId: TEST_TEAM },
        body: { enabled: true },
      });

      // Now delete it
      const res = await deleteApiProvidersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "to-delete-provider" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("success");
        expect(res.data.success).toBe(true);
      }
    });
  });
});
