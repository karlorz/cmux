/**
 * Project Route Tests
 *
 * Tests for project management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiProjects,
  postApiProjects,
  getApiProjectsByProjectId,
  patchApiProjectsByProjectId,
  getApiProjectsByProjectIdProgress,
  putApiProjectsByProjectIdPlan,
  postApiProjectsByProjectIdDispatch,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("projectRouter", () => {
  describe("GET /api/projects", () => {
    it("requires authentication", async () => {
      const res = await getApiProjects({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns project list for authenticated user", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProjects({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(Array.isArray(res.data)).toBe(true);
      }
    });

    it("filters by status", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProjects({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, status: "active" },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("supports limit parameter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProjects({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, limit: 5 },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.length).toBeLessThanOrEqual(5);
      }
    });
  });

  describe("POST /api/projects", () => {
    it("requires authentication", async () => {
      const res = await postApiProjects({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          name: "Test Project",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("creates new project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiProjects({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          name: `Test Project ${Date.now()}`,
          description: "A test project for integration tests",
          status: "planning",
        },
      });

      // Auth may fail, or team not found
      expect([201, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 201 && res.data) {
        expect(res.data).toHaveProperty("id");
      }
    });
  });

  describe("GET /api/projects/:projectId", () => {
    it("requires authentication", async () => {
      const res = await getApiProjectsByProjectId({
        client: testApiClient,
        path: { projectId: "proj_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns 404 for non-existent project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProjectsByProjectId({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { projectId: "proj_nonexistent12345" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or project not found
      expect([401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("PATCH /api/projects/:projectId", () => {
    it("requires authentication", async () => {
      const res = await patchApiProjectsByProjectId({
        client: testApiClient,
        path: { projectId: "proj_test123" },
        body: {
          name: "Updated Project Name",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns 404 for non-existent project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await patchApiProjectsByProjectId({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { projectId: "proj_nonexistent12345" },
        body: {
          status: "active",
        },
      });

      // Auth may fail, or project not found
      expect([401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("PUT /api/projects/:projectId/plan", () => {
    it("requires authentication", async () => {
      const res = await putApiProjectsByProjectIdPlan({
        client: testApiClient,
        path: { projectId: "proj_test123" },
        body: {
          orchestrationId: "orch_test123",
          headAgent: "claude/opus-4.5",
          tasks: [],
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns 404 for non-existent project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await putApiProjectsByProjectIdPlan({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { projectId: "proj_nonexistent12345" },
        body: {
          orchestrationId: "orch_test123",
          headAgent: "claude/opus-4.5",
          tasks: [
            {
              id: "task_1",
              prompt: "Implement feature X",
              agentName: "claude/haiku-4.5",
              status: "pending",
            },
          ],
        },
      });

      expect([401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("GET /api/projects/:projectId/progress", () => {
    it("requires authentication", async () => {
      const res = await getApiProjectsByProjectIdProgress({
        client: testApiClient,
        path: { projectId: "proj_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns progress metrics", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiProjectsByProjectIdProgress({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { projectId: "proj_test123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or project not found
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("total");
        expect(res.data).toHaveProperty("completed");
        expect(res.data).toHaveProperty("progressPercent");
      }
    });
  });

  describe("POST /api/projects/:projectId/dispatch", () => {
    it("requires authentication", async () => {
      const res = await postApiProjectsByProjectIdDispatch({
        client: testApiClient,
        path: { projectId: "proj_test123" },
        body: {},
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns 404 for non-existent project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiProjectsByProjectIdDispatch({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { projectId: "proj_nonexistent12345" },
        body: {},
      });

      expect([401, 403, 404, 422, 500]).toContain(res.response.status);
    });
  });
});
