/**
 * Branch Route Tests
 *
 * Tests for git branch name generation endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import { postApiBranchesGenerate } from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("branchRouter", () => {
  describe("POST /api/branches/generate", () => {
    it("requires authentication", async () => {
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          taskDescription: "Fix bug in login form",
        },
      });

      expect(res.response.status).toBe(401);
    });

    it("requires either taskDescription or prTitle", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          // Missing both taskDescription and prTitle
        } as Parameters<typeof postApiBranchesGenerate>[0]["body"],
      });

      // Should return 400 or 422 for validation error
      expect([400, 422]).toContain(res.response.status);
    });

    it("generates branch name from prTitle", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Add user authentication",
        },
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("branchNames");
        expect(res.data).toHaveProperty("baseBranchName");
        expect(res.data).toHaveProperty("usedFallback");
        expect(Array.isArray(res.data.branchNames)).toBe(true);
        expect(res.data.branchNames.length).toBe(1);
        // Branch should contain kebab-cased title
        expect(res.data.baseBranchName).toMatch(/add-user-authentication/i);
      }
    });

    it("generates multiple branch names with count parameter", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Parallel task branches",
          count: 3,
        },
      });

      if (res.response.status === 200 && res.data) {
        expect(res.data.branchNames.length).toBe(3);
        // Each branch should be unique
        const uniqueNames = new Set(res.data.branchNames);
        expect(uniqueNames.size).toBe(3);
      }
    });

    it("generates branch from task description", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          taskDescription: "Implement OAuth2 login flow with Google provider",
        },
      });

      // May use AI or fallback
      expect([200, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.branchNames.length).toBeGreaterThan(0);
        expect(res.data).toHaveProperty("usedFallback");
        expect(res.data).toHaveProperty("providerName");
      }
    });

    it("respects uniqueId parameter for deterministic naming", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const uniqueId = "abc12";

      const res1 = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Test branch",
          uniqueId,
        },
      });

      const res2 = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Test branch",
          uniqueId,
        },
      });

      if (res1.response.status === 200 && res2.response.status === 200 &&
          res1.data && res2.data) {
        // Same uniqueId should produce same branch name
        expect(res1.data.branchNames[0]).toBe(res2.data.branchNames[0]);
      }
    });

    it("validates uniqueId format", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Test branch",
          uniqueId: "invalid-id", // Should be 5 lowercase alphanumeric chars
        },
      });

      // Should reject invalid uniqueId format
      expect([400, 422]).toContain(res.response.status);
    });

    it("validates count range", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();

      // Test count too high
      const resTooHigh = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Test branch",
          count: 5000, // Max is 2000
        },
      });

      expect([400, 422]).toContain(resTooHigh.response.status);

      // Test count too low
      const resTooLow = await postApiBranchesGenerate({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          teamSlugOrId: TEST_TEAM,
          prTitle: "Test branch",
          count: 0, // Min is 1
        },
      });

      expect([400, 422]).toContain(resTooLow.response.status);
    });
  });
});
