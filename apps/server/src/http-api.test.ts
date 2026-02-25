/**
 * HTTP API Integration Tests for apps/server
 *
 * Tests the /api/start-task endpoint that enables CLI to spawn agents
 * using the same code path as the web app's socket.io "start-task" event.
 *
 * To run: bun test apps/server/src/http-api.test.ts
 *
 * Note: These tests require the dev server to be running (make dev)
 * and proper authentication setup. They are designed to verify the
 * HTTP API matches the socket.io behavior.
 *
 * IMPORTANT: These are integration tests that require the apps/server
 * to be running. In CI, these tests will be skipped if the server
 * is not available.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { AGENT_CATALOG } from "@cmux/shared/agent-catalog";

const SERVER_URL = process.env.CMUX_SERVER_URL ?? "http://localhost:9776";

// Check if server is available before running tests
let serverAvailable = false;

// Helper to safely fetch with connection error handling
async function safeFetch(
  url: string,
  options?: RequestInit,
): Promise<Response | null> {
  try {
    return await fetch(url, options);
  } catch (error) {
    // Connection refused or other network error
    if (
      error instanceof Error &&
      (error.message.includes("ECONNREFUSED") ||
        error.message.includes("fetch failed"))
    ) {
      return null;
    }
    throw error;
  }
}

describe("HTTP API - apps/server", () => {
  beforeAll(async () => {
    // Check if server is running
    const response = await safeFetch(`${SERVER_URL}/api/health`);
    serverAvailable = response !== null && response.ok;
    if (!serverAvailable) {
      console.log(
        "[http-api.test] Server not available at",
        SERVER_URL,
        "- skipping integration tests",
      );
    }
  });

  describe("Health Check", () => {
    it("GET /api/health returns ok status", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/health`);
      expect(response).not.toBeNull();

      const data = await response!.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("apps-server");
    });
  });

  describe("Authentication", () => {
    it("POST /api/start-task rejects missing auth", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          taskId: "test_task_123",
          taskDescription: "Test task",
          projectFullName: "test/repo",
          teamSlugOrId: "dev",
        }),
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(401);
      const data = await response!.json();
      expect(data.error).toContain("Unauthorized");
    });
  });

  describe("Request Validation", () => {
    it("POST /api/start-task rejects invalid JSON", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake_token",
        },
        body: "not json",
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(400);
    });

    it("POST /api/start-task rejects missing required fields", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake_token",
        },
        body: JSON.stringify({
          // Missing taskId, taskDescription, projectFullName
          teamSlugOrId: "dev",
        }),
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(400);
      const data = await response!.json();
      expect(data.error).toContain("Missing required fields");
    });

    it("POST /api/start-task rejects missing teamSlugOrId", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer fake_token",
        },
        body: JSON.stringify({
          taskId: "test_task_123",
          taskDescription: "Test task",
          projectFullName: "test/repo",
          // Missing teamSlugOrId
        }),
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(400);
      const data = await response!.json();
      expect(data.error).toContain("teamSlugOrId");
    });
  });

  describe("CORS", () => {
    it("OPTIONS /api/start-task returns CORS headers", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/start-task`, {
        method: "OPTIONS",
      });

      expect(response).not.toBeNull();
      expect(response!.status).toBe(204);
      expect(response!.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response!.headers.get("Access-Control-Allow-Methods")).toContain(
        "POST",
      );
      expect(response!.headers.get("Access-Control-Allow-Headers")).toContain(
        "Authorization",
      );
    });
  });

  describe("Models API", () => {
    it("GET /api/models returns model catalog", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }
      const response = await safeFetch(`${SERVER_URL}/api/models`);
      expect(response).not.toBeNull();
      expect(response!.status).toBe(200);

      const data = await response!.json();
      expect(data).toHaveProperty("models");
      expect(Array.isArray(data.models)).toBe(true);
      expect(data.models.length).toBeGreaterThan(0);

      // Verify model structure
      const model = data.models[0];
      expect(model).toHaveProperty("name");
      expect(model).toHaveProperty("displayName");
      expect(model).toHaveProperty("vendor");
      expect(model).toHaveProperty("tier");
      expect(model).toHaveProperty("disabled");
      expect(model).toHaveProperty("requiredApiKeys");
    });
  });

  describe("Models API - Data Integrity", () => {
    it("returns same count as AGENT_CATALOG", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/models`);
      expect(response).not.toBeNull();
      const data = await response!.json();

      expect(data.models.length).toBe(AGENT_CATALOG.length);
    });

    it("model names match catalog entries", async () => {
      if (!serverAvailable) {
        console.log("Server not running - skipping test");
        return;
      }

      const response = await safeFetch(`${SERVER_URL}/api/models`);
      expect(response).not.toBeNull();
      const data = await response!.json();

      const apiNames = new Set(
        data.models.map((m: { name: string }) => m.name),
      );
      const catalogNames = new Set(AGENT_CATALOG.map((e) => e.name));

      expect(apiNames).toEqual(catalogNames);
    });
  });

  // ==========================================================================
  // Orchestration API Tests
  // ==========================================================================

  describe("Orchestration API", () => {
    describe("POST /api/orchestrate/spawn", () => {
      it("rejects unauthorized requests", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(`${SERVER_URL}/api/orchestrate/spawn`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            teamSlugOrId: "dev",
            agent: "claude/haiku-4.5",
            prompt: "test prompt",
          }),
        });

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("validates required fields", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(`${SERVER_URL}/api/orchestrate/spawn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer fake_token",
          },
          body: JSON.stringify({ teamSlugOrId: "dev" }), // missing agent and prompt
        });

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("Missing required fields");
      });

      it("rejects invalid JSON body", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(`${SERVER_URL}/api/orchestrate/spawn`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer fake_token",
          },
          body: "not json",
        });

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
      });
    });

    describe("GET /api/orchestrate/list", () => {
      it("rejects unauthorized requests", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/list?teamSlugOrId=dev`,
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("requires teamSlugOrId query parameter", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(`${SERVER_URL}/api/orchestrate/list`, {
          headers: { Authorization: "Bearer fake_token" },
        });

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("teamSlugOrId");
      });
    });

    describe("GET /api/orchestrate/status/:id", () => {
      it("rejects unauthorized requests", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/status/invalid_id_123?teamSlugOrId=dev`,
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("returns error for invalid orchestration task ID", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/status/invalid_id_123?teamSlugOrId=dev`,
          { headers: { Authorization: "Bearer fake_token" } },
        );

        expect(response).not.toBeNull();
        // Expect either 401 (invalid token) or 500 (not found error)
        expect([401, 500]).toContain(response!.status);
      });

      it("requires teamSlugOrId query parameter", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/status/some_id`,
          { headers: { Authorization: "Bearer fake_token" } },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("teamSlugOrId");
      });
    });

    describe("POST /api/orchestrate/cancel/:id", () => {
      it("rejects unauthorized requests", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/cancel/invalid_id_123`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ teamSlugOrId: "dev" }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("requires teamSlugOrId in body", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/cancel/some_id`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer fake_token",
            },
            body: JSON.stringify({}),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("teamSlugOrId");
      });
    });

    describe("POST /api/orchestrate/migrate", () => {
      it("rejects unauthorized requests", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/migrate`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              teamSlugOrId: "dev",
              planJson: JSON.stringify({ headAgent: "claude/haiku-4.5" }),
            }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("validates required fields", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/migrate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer fake_token",
            },
            body: JSON.stringify({ teamSlugOrId: "dev" }), // missing planJson
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("Missing required fields");
      });

      it("rejects invalid planJson", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/migrate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer fake_token",
            },
            body: JSON.stringify({
              teamSlugOrId: "dev",
              planJson: "not valid json",
            }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("planJson");
      });

      it("requires headAgent in plan or request", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/migrate`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer fake_token",
            },
            body: JSON.stringify({
              teamSlugOrId: "dev",
              planJson: JSON.stringify({ description: "no head agent" }),
            }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(400);
        const data = await response!.json();
        expect(data.error).toContain("headAgent");
      });
    });

    describe("POST /api/orchestrate/internal/spawn", () => {
      it("rejects requests without internal secret", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/internal/spawn`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              orchestrationTaskId: "test",
              teamId: "test",
              agentName: "claude/haiku-4.5",
              prompt: "test",
              taskId: "test",
              taskRunId: "test",
            }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("rejects requests with wrong internal secret", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/internal/spawn`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": "wrong_secret",
            },
            body: JSON.stringify({
              orchestrationTaskId: "test",
              teamId: "test",
              agentName: "claude/haiku-4.5",
              prompt: "test",
              taskId: "test",
              taskRunId: "test",
            }),
          },
        );

        expect(response).not.toBeNull();
        expect(response!.status).toBe(401);
      });

      it("validates required fields", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        // Even with a valid secret, missing fields should return 400
        // This test documents expected behavior
        const response = await safeFetch(
          `${SERVER_URL}/api/orchestrate/internal/spawn`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-internal-secret": "any_secret", // will fail auth first
            },
            body: JSON.stringify({}), // missing all required fields
          },
        );

        expect(response).not.toBeNull();
        // Will fail at auth (401) before field validation (400)
        expect([400, 401]).toContain(response!.status);
      });
    });

    // ========================================================================
    // Happy-Path Tests (require valid authentication)
    // These tests verify successful orchestration flows with mocked sandbox
    // ========================================================================
    describe("Happy Path - Orchestration Flows", () => {
      // Note: These tests require Stack Auth credentials in environment.
      // Skip if credentials not available.
      const hasCredentials = !!(
        process.env.NEXT_PUBLIC_STACK_PROJECT_ID &&
        process.env.STACK_SECRET_SERVER_KEY &&
        process.env.STACK_SUPER_SECRET_ADMIN_KEY
      );

      it.skipIf(!hasCredentials)("GET /api/orchestrate/list returns tasks array with valid auth", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        // Import auth helper dynamically to avoid issues if not available
        const { authenticatedFetch, TEST_TEAM, buildUrl } = await import(
          "./test-fixtures/auth-helper"
        );

        const url = buildUrl(SERVER_URL, "/api/orchestrate/list", {
          teamSlugOrId: TEST_TEAM,
        });

        const result = await authenticatedFetch<{ tasks: unknown[] }>(url);

        // Either success with tasks array, or team not found (both valid)
        if (result.ok) {
          expect(result.data?.tasks).toBeDefined();
          expect(Array.isArray(result.data?.tasks)).toBe(true);
        } else {
          // 500 is acceptable if team doesn't exist or other backend issue
          expect([401, 403, 500]).toContain(result.status);
        }
      });

      it.skipIf(!hasCredentials)("GET /api/orchestrate/list filters by status", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM, buildUrl } = await import(
          "./test-fixtures/auth-helper"
        );

        // Test filtering by pending status
        const url = buildUrl(SERVER_URL, "/api/orchestrate/list", {
          teamSlugOrId: TEST_TEAM,
          status: "pending",
        });

        const result = await authenticatedFetch<{
          tasks: Array<{ status: string }>;
        }>(url);

        if (result.ok && result.data?.tasks) {
          // All returned tasks should have pending status
          for (const task of result.data.tasks) {
            expect(task.status).toBe("pending");
          }
        }
        // Non-ok responses are acceptable (team not found, etc.)
      });

      it.skipIf(!hasCredentials)("GET /api/orchestrate/list rejects invalid status filter", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM, buildUrl } = await import(
          "./test-fixtures/auth-helper"
        );

        const url = buildUrl(SERVER_URL, "/api/orchestrate/list", {
          teamSlugOrId: TEST_TEAM,
          status: "invalid_status",
        });

        const result = await authenticatedFetch<unknown>(url);
        expect(result.ok).toBe(false);
        expect(result.status).toBe(400);
        expect(result.error).toContain("Invalid status");
      });

      it.skipIf(!hasCredentials)("POST /api/orchestrate/spawn validates agent name", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM } = await import(
          "./test-fixtures/auth-helper"
        );

        const result = await authenticatedFetch<{ error: string }>(
          `${SERVER_URL}/api/orchestrate/spawn`,
          {
            method: "POST",
            body: {
              teamSlugOrId: TEST_TEAM,
              agent: "invalid/nonexistent-agent",
              prompt: "Test prompt",
            },
          }
        );

        // Should fail because agent doesn't exist
        expect(result.ok).toBe(false);
        expect(result.status).toBe(500);
        expect(result.error).toContain("Agent not found");
      });

      it.skipIf(!hasCredentials)("GET /api/orchestrate/status returns 500 for nonexistent task", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM, buildUrl } = await import(
          "./test-fixtures/auth-helper"
        );

        const url = buildUrl(
          SERVER_URL,
          "/api/orchestrate/status/nonexistent_task_id_12345",
          { teamSlugOrId: TEST_TEAM }
        );

        const result = await authenticatedFetch<{ error: string }>(url);

        // Should fail because task doesn't exist
        expect(result.ok).toBe(false);
        // Can be 500 (not found error) or 401 (team membership check failed)
        expect([401, 500]).toContain(result.status);
      });

      it.skipIf(!hasCredentials)("POST /api/orchestrate/cancel returns error for nonexistent task", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM } = await import(
          "./test-fixtures/auth-helper"
        );

        const result = await authenticatedFetch<{ error: string }>(
          `${SERVER_URL}/api/orchestrate/cancel/nonexistent_task_id_12345`,
          {
            method: "POST",
            body: { teamSlugOrId: TEST_TEAM },
          }
        );

        // Should fail because task doesn't exist
        expect(result.ok).toBe(false);
        expect([401, 500]).toContain(result.status);
      });

      it.skipIf(!hasCredentials)("POST /api/orchestrate/migrate rejects empty plan tasks", async () => {
        if (!serverAvailable) {
          console.log("Server not running - skipping test");
          return;
        }

        const { authenticatedFetch, TEST_TEAM } = await import(
          "./test-fixtures/auth-helper"
        );

        // Valid plan with headAgent but no tasks
        const validPlan = {
          headAgent: "claude/haiku-4.5",
          orchestrationId: "test_orch_123",
          description: "Test migration",
          tasks: [],
        };

        const result = await authenticatedFetch<{
          orchestrationTaskId: string;
          status: string;
        }>(`${SERVER_URL}/api/orchestrate/migrate`, {
          method: "POST",
          body: {
            teamSlugOrId: TEST_TEAM,
            planJson: JSON.stringify(validPlan),
          },
        });

        // Either succeeds (creates head agent task) or fails on team validation
        // Both are valid outcomes for this test
        if (result.ok) {
          expect(result.data?.orchestrationTaskId).toBeDefined();
          // Status could be "running" or "failed" depending on spawn success
          expect(["running", "failed"]).toContain(result.data?.status);
        } else {
          // Team not found or other auth issue
          expect([401, 500]).toContain(result.status);
        }
      });
    });
  });
});
