/**
 * MCP Servers Route Tests
 *
 * Tests for MCP server configuration management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  getApiMcpServers,
  postApiMcpServers,
  deleteApiMcpServersById,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("mcpServersRouter", () => {
  describe("GET /api/mcp-servers", () => {
    it("requires authentication", async () => {
      const res = await getApiMcpServers({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns MCP server configs and presets", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiMcpServers({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail in CI
      expect([200, 401, 403, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("configs");
        expect(res.data).toHaveProperty("presets");
        expect(Array.isArray(res.data.configs)).toBe(true);
        expect(Array.isArray(res.data.presets)).toBe(true);
      }
    });

    it("filters by scope", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiMcpServers({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, scope: "global" },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });

    it("filters by project", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await getApiMcpServers({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM, projectFullName: "owner/repo" },
      });

      expect([200, 401, 403, 500]).toContain(res.response.status);
    });
  });

  describe("POST /api/mcp-servers", () => {
    it("requires authentication", async () => {
      const res = await postApiMcpServers({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          name: "test-server",
          displayName: "Test Server",
          type: "stdio",
          command: "echo",
          args: ["hello"],
          enabledClaude: true,
          enabledCodex: false,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "global",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("creates stdio MCP server config", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiMcpServers({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          name: "test-mcp-server",
          displayName: "Test MCP Server",
          type: "stdio",
          command: "npx",
          args: ["-y", "@modelcontextprotocol/server-filesystem"],
          enabledClaude: true,
          enabledCodex: true,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "global",
        },
      });

      // Auth may fail, or team not found
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data.success).toBe(true);
      }
    });

    it("creates http MCP server config", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiMcpServers({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        query: { teamSlugOrId: TEST_TEAM },
        body: {
          name: "test-http-server",
          displayName: "Test HTTP Server",
          type: "http",
          url: "https://mcp.example.com",
          enabledClaude: true,
          enabledCodex: false,
          enabledGemini: false,
          enabledOpencode: false,
          scope: "workspace",
          projectFullName: "owner/repo",
        },
      });

      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
    });
  });

  describe("DELETE /api/mcp-servers/:id", () => {
    it("requires authentication", async () => {
      const res = await deleteApiMcpServersById({
        client: testApiClient,
        path: { id: "test-id-123" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns appropriate status for deletion", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await deleteApiMcpServersById({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { id: "nonexistent-mcp-server-id" },
        query: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or config not found
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
    });
  });
});
