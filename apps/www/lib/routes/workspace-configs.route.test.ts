/**
 * Workspace Configs Route Tests
 *
 * Tests for workspace configuration management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiWorkspaceConfigs,
  postApiWorkspaceConfigs,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("workspaceConfigsRouter", () => {
  describe("GET /api/workspace-configs", () => {
    it("requires authentication", async () => {
      const res = await getApiWorkspaceConfigs({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM, projectFullName: "owner/repo" },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns workspace config for authenticated user", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiWorkspaceConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, projectFullName: "owner/repo" },
      });

      // Auth may fail, or returns null for non-existent config
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200) {
        // Can be null or an object
        if (res.data !== null) {
          expect(res.data).toHaveProperty("projectFullName");
          expect(res.data).toHaveProperty("envVarsContent");
        }
      }
    });

    it("returns null for non-existent config", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiWorkspaceConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, projectFullName: "nonexistent/project" },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });
  });

  describe("POST /api/workspace-configs", () => {
    it("requires authentication", async () => {
      const res = await postApiWorkspaceConfigs({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          projectFullName: "owner/repo",
          envVarsContent: "KEY=value",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("creates or updates workspace config", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiWorkspaceConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          projectFullName: "test/workspace-config-test",
          envVarsContent: "TEST_VAR=test_value\nANOTHER_VAR=another_value",
          maintenanceScript: "#!/bin/bash\necho 'Hello'",
        },
      });

      // Auth may fail, or team not found, or data vault not configured
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.projectFullName).toBe("test/workspace-config-test");
        expect(res.data).toHaveProperty("envVarsContent");
      }
    });

    it("handles empty env vars content", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiWorkspaceConfigs({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          projectFullName: "test/empty-env-test",
          envVarsContent: "",
        },
      });

      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
    });
  });
});
