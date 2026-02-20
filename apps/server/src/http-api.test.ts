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

const SERVER_URL = process.env.CMUX_SERVER_URL ?? "http://localhost:9776";

// Check if server is available before running tests
let serverAvailable = false;

// Helper to safely fetch with connection error handling
async function safeFetch(
  url: string,
  options?: RequestInit
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
        "- skipping integration tests"
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
      expect(
        response!.headers.get("Access-Control-Allow-Methods")
      ).toContain("POST");
      expect(
        response!.headers.get("Access-Control-Allow-Headers")
      ).toContain("Authorization");
    });
  });
});
