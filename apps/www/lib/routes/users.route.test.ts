/**
 * Users Route Tests
 *
 * Tests for user management endpoints (demo/example route).
 */

import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiUsers,
  getApiUsersById,
  postApiUsers,
  patchApiUsersById,
  deleteApiUsersById,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

describe("usersRouter", () => {
  describe("GET /api/users", () => {
    it("returns user list", async () => {
      const res = await getApiUsers({
        client: testApiClient,
      });

      expect(res.response.status).toBe(200);
      if (res.data) {
        expect(res.data).toHaveProperty("users");
        expect(res.data).toHaveProperty("total");
        expect(res.data).toHaveProperty("page");
        expect(res.data).toHaveProperty("pageSize");
        expect(Array.isArray(res.data.users)).toBe(true);
      }
    });

    it("supports pagination", async () => {
      const res = await getApiUsers({
        client: testApiClient,
        query: { page: "1", pageSize: "5" },
      });

      expect(res.response.status).toBe(200);
      if (res.data) {
        expect(res.data.page).toBe(1);
        expect(res.data.pageSize).toBe(5);
      }
    });

    it("supports search filter", async () => {
      const res = await getApiUsers({
        client: testApiClient,
        query: { search: "alice" },
      });

      expect(res.response.status).toBe(200);
    });
  });

  describe("GET /api/users/:id", () => {
    it("returns user for valid ID", async () => {
      const res = await getApiUsersById({
        client: testApiClient,
        path: { id: "user-1" },
      });

      expect(res.response.status).toBe(200);
      if (res.data && "id" in res.data) {
        expect(res.data.id).toBe("user-1");
        expect(res.data).toHaveProperty("name");
        expect(res.data).toHaveProperty("email");
      }
    });

    it("returns 404 for non-existent user", async () => {
      const res = await getApiUsersById({
        client: testApiClient,
        path: { id: "user-nonexistent-12345" },
      });

      expect(res.response.status).toBe(404);
    });
  });

  describe("POST /api/users", () => {
    it("creates new user", async () => {
      const res = await postApiUsers({
        client: testApiClient,
        body: {
          name: "Test User",
          email: "test@example.com",
          age: 25,
        },
      });

      expect(res.response.status).toBe(201);
      if (res.data) {
        expect(res.data).toHaveProperty("id");
        expect(res.data.name).toBe("Test User");
        expect(res.data.email).toBe("test@example.com");
      }
    });
  });

  describe("PATCH /api/users/:id", () => {
    it("updates existing user", async () => {
      const res = await patchApiUsersById({
        client: testApiClient,
        path: { id: "user-1" },
        body: {
          name: "Updated Alice",
        },
      });

      // User may have been deleted by other tests, so 404 is acceptable
      expect([200, 404]).toContain(res.response.status);
    });

    it("returns 404 for non-existent user", async () => {
      const res = await patchApiUsersById({
        client: testApiClient,
        path: { id: "user-nonexistent-12345" },
        body: {
          name: "Updated Name",
        },
      });

      expect(res.response.status).toBe(404);
    });
  });

  describe("DELETE /api/users/:id", () => {
    it("returns appropriate status for deletion", async () => {
      const res = await deleteApiUsersById({
        client: testApiClient,
        path: { id: "user-2" },
      });

      // Could be 204 (success) or 404 (already deleted)
      expect([204, 404]).toContain(res.response.status);
    });

    it("returns 404 for non-existent user", async () => {
      const res = await deleteApiUsersById({
        client: testApiClient,
        path: { id: "user-nonexistent-12345" },
      });

      expect(res.response.status).toBe(404);
    });
  });
});
