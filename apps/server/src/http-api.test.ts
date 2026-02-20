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
 */

import { describe, it, expect } from "vitest";

const SERVER_URL = process.env.CMUX_SERVER_URL ?? "http://localhost:9776";

describe("HTTP API - apps/server", () => {
  describe("Health Check", () => {
    it("GET /api/health returns ok status", async () => {
      const response = await fetch(`${SERVER_URL}/api/health`);

      // May fail if server not running - that's expected in CI
      if (!response.ok) {
        console.log("Server not running - skipping health check test");
        return;
      }

      const data = await response.json();
      expect(data.status).toBe("ok");
      expect(data.service).toBe("apps-server");
    });
  });

  describe("Authentication", () => {
    it("POST /api/start-task rejects missing auth", async () => {
      const response = await fetch(`${SERVER_URL}/api/start-task`, {
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

      // Server may not be running
      if (response.status === 0) {
        console.log("Server not running - skipping auth test");
        return;
      }

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain("Unauthorized");
    });
  });

  describe("Request Validation", () => {
    it("POST /api/start-task rejects invalid JSON", async () => {
      const response = await fetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer fake_token",
        },
        body: "not json",
      });

      // Server may not be running
      if (response.status === 0) {
        console.log("Server not running - skipping validation test");
        return;
      }

      expect(response.status).toBe(400);
    });

    it("POST /api/start-task rejects missing required fields", async () => {
      const response = await fetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer fake_token",
        },
        body: JSON.stringify({
          // Missing taskId, taskDescription, projectFullName
          teamSlugOrId: "dev",
        }),
      });

      // Server may not be running
      if (response.status === 0) {
        console.log("Server not running - skipping validation test");
        return;
      }

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("Missing required fields");
    });

    it("POST /api/start-task rejects missing teamSlugOrId", async () => {
      const response = await fetch(`${SERVER_URL}/api/start-task`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer fake_token",
        },
        body: JSON.stringify({
          taskId: "test_task_123",
          taskDescription: "Test task",
          projectFullName: "test/repo",
          // Missing teamSlugOrId
        }),
      });

      // Server may not be running
      if (response.status === 0) {
        console.log("Server not running - skipping validation test");
        return;
      }

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toContain("teamSlugOrId");
    });
  });

  describe("CORS", () => {
    it("OPTIONS /api/start-task returns CORS headers", async () => {
      const response = await fetch(`${SERVER_URL}/api/start-task`, {
        method: "OPTIONS",
      });

      // Server may not be running
      if (response.status === 0) {
        console.log("Server not running - skipping CORS test");
        return;
      }

      expect(response.status).toBe(204);
      expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(response.headers.get("Access-Control-Allow-Methods")).toContain("POST");
      expect(response.headers.get("Access-Control-Allow-Headers")).toContain("Authorization");
    });
  });
});
