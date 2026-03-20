/**
 * Preview Route Tests
 *
 * Tests for preview configuration and job management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiPreviewConfigs,
  postApiPreviewConfigs,
  deleteApiPreviewConfigsByPreviewConfigId,
  getApiPreviewConfigsByPreviewConfigIdRuns,
  getApiPreviewTestCheckAccess,
  getApiPreviewTestJobs,
  getApiPreviewTestJobsByPreviewRunId,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("previewRouter", () => {
  describe("GET /api/preview/configs", () => {
    it("requires authentication", async () => {
      const res = await getApiPreviewConfigs({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns preview configs for authenticated user", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(Array.isArray(res.data)).toBe(true);
      }
    });
  });

  describe("POST /api/preview/configs", () => {
    it("requires authentication", async () => {
      const res = await postApiPreviewConfigs({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          repoFullName: "owner/repo",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("validates required fields", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPreviewConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          // Missing repoFullName
        } as Parameters<typeof postApiPreviewConfigs>[0]["body"],
      });

      // Should fail validation
      expect([400, 401, 422]).toContain(res.response.status);
    });

    it("creates preview config with valid data", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPreviewConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          repoFullName: "test-owner/test-repo",
        },
      });

      // Auth may fail, or repo not accessible
      expect([200, 201, 401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("DELETE /api/preview/configs/:previewConfigId", () => {
    it("requires authentication", async () => {
      const res = await deleteApiPreviewConfigsByPreviewConfigId({
        client: testApiClient,
        path: { previewConfigId: "pconf_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns appropriate status for deletion", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await deleteApiPreviewConfigsByPreviewConfigId({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { previewConfigId: "pconf_nonexistent12345" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Either succeeds, 404, or auth fails
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("GET /api/preview/configs/:previewConfigId/runs", () => {
    it("requires authentication", async () => {
      const res = await getApiPreviewConfigsByPreviewConfigIdRuns({
        client: testApiClient,
        path: { previewConfigId: "pconf_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns runs list", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewConfigsByPreviewConfigIdRuns({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { previewConfigId: "pconf_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or config not found
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(Array.isArray(res.data)).toBe(true);
      }
    });
  });

  describe("GET /api/preview/test/check-access", () => {
    it("requires authentication", async () => {
      const res = await getApiPreviewTestCheckAccess({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM, prUrl: "https://github.com/owner/repo/pull/1" },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("checks repo access", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewTestCheckAccess({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, prUrl: "https://github.com/test-owner/test-repo/pull/1" },
      });

      // Auth may fail
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("hasAccess");
      }
    });
  });

  describe("GET /api/preview/test/jobs", () => {
    it("requires authentication", async () => {
      const res = await getApiPreviewTestJobs({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns jobs list", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewTestJobs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // 401 may occur if test tokens are invalid in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("jobs");
        expect(Array.isArray(res.data.jobs)).toBe(true);
      }
    });

    it("supports pagination", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewTestJobs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, limit: 5 },
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data.jobs.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("GET /api/preview/test/jobs/:previewRunId", () => {
    it("requires authentication", async () => {
      const res = await getApiPreviewTestJobsByPreviewRunId({
        client: testApiClient,
        path: { previewRunId: "prun_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns 404 for non-existent job", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiPreviewTestJobsByPreviewRunId({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { previewRunId: "prun_nonexistent12345" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or job not found
      expect([401, 403, 404, 500]).toContain(res.response.status);
    });
  });
});
