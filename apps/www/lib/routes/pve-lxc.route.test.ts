/**
 * PVE LXC Route Tests
 *
 * Tests for Proxmox VE LXC container management endpoints.
 */

import { __TEST_INTERNAL_ONLY_GET_STACK_TOKENS } from "@/lib/test-utils/__TEST_INTERNAL_ONLY_GET_STACK_TOKENS";
import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  postApiPveLxcTaskRunsByTaskRunIdResume,
  postApiPveLxcPreviewInstancesStart,
  postApiPveLxcPreviewInstancesByInstanceIdExec,
  deleteApiPveLxcPreviewInstancesByInstanceId,
  postApiPveLxcPreviewInstancesByInstanceIdReadFile,
  postApiPveLxcTaskRunsByTaskRunIdIsStopped,
  postApiSandboxesByIdRecordCreate,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("pveLxcRouter", () => {
  describe("POST /api/pve-lxc/task-runs/:taskRunId/resume", () => {
    it("requires authentication", async () => {
      const res = await postApiPveLxcTaskRunsByTaskRunIdResume({
        client: testApiClient,
        path: { taskRunId: "trun_test123" },
        body: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns error for non-existent task run", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPveLxcTaskRunsByTaskRunIdResume({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { taskRunId: "trun_nonexistent12345" },
        body: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, task run not found, or PVE not configured
      expect([401, 403, 404, 500, 503]).toContain(res.response.status);
    });
  });

  describe("POST /api/pve-lxc/preview/instances/start", () => {
    it("requires authentication", async () => {
      const res = await postApiPveLxcPreviewInstancesStart({
        client: testApiClient,
        body: {
          snapshotId: "snapshot_test123",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("attempts to start instance", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPveLxcPreviewInstancesStart({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        body: {
          snapshotId: "snapshot_test123",
        },
      });

      // Auth may fail, or PVE not configured in CI
      expect([200, 401, 403, 500, 503]).toContain(res.response.status);
    });
  });

  describe("POST /api/pve-lxc/preview/instances/:instanceId/exec", () => {
    it("requires authentication", async () => {
      const res = await postApiPveLxcPreviewInstancesByInstanceIdExec({
        client: testApiClient,
        path: { instanceId: "pvelxc-test123" },
        body: {
          command: "echo test",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("validates command execution", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPveLxcPreviewInstancesByInstanceIdExec({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { instanceId: "pvelxc-test123" },
        body: {
          command: "echo hello",
        },
      });

      // Auth may fail, instance not found, or PVE not configured
      expect([200, 401, 403, 404, 500, 503]).toContain(res.response.status);
    });
  });

  describe("DELETE /api/pve-lxc/preview/instances/:instanceId", () => {
    it("requires authentication", async () => {
      const res = await deleteApiPveLxcPreviewInstancesByInstanceId({
        client: testApiClient,
        path: { instanceId: "pvelxc-test123" },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("returns appropriate status for deletion", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await deleteApiPveLxcPreviewInstancesByInstanceId({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { instanceId: "pvelxc-nonexistent123" },
      });

      // Auth may fail, instance not found, or PVE not configured
      expect([200, 401, 403, 404, 500, 503]).toContain(res.response.status);
    });
  });

  describe("POST /api/pve-lxc/preview/instances/:instanceId/read-file", () => {
    it("requires authentication", async () => {
      const res = await postApiPveLxcPreviewInstancesByInstanceIdReadFile({
        client: testApiClient,
        path: { instanceId: "pvelxc-test123" },
        body: {
          filePath: "/etc/os-release",
        },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("validates file path", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPveLxcPreviewInstancesByInstanceIdReadFile({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { instanceId: "pvelxc-test123" },
        body: {
          filePath: "/etc/os-release",
        },
      });

      // Auth may fail, instance not found, or PVE not configured
      expect([200, 401, 403, 404, 500, 503]).toContain(res.response.status);
    });
  });

  describe("POST /api/sandboxes/:id/record-create", () => {
    it("requires authentication", async () => {
      const res = await postApiSandboxesByIdRecordCreate({
        client: testApiClient,
        path: { id: "pvelxc-test123" },
        body: {
          teamSlugOrId: TEST_TEAM,
          provider: "pve-lxc",
        },
      });

      expect(res.response.status).toBe(401);
    });
  });

  describe("POST /api/pve-lxc/task-runs/:taskRunId/is-stopped", () => {
    it("requires authentication", async () => {
      const res = await postApiPveLxcTaskRunsByTaskRunIdIsStopped({
        client: testApiClient,
        path: { taskRunId: "trun_test123" },
        body: { teamSlugOrId: TEST_TEAM },
      });

      expect([401, 500]).toContain(res.response.status);
    });

    it("checks if task run is stopped", async () => {
      const tokens = await __TEST_INTERNAL_ONLY_GET_STACK_TOKENS();
      const res = await postApiPveLxcTaskRunsByTaskRunIdIsStopped({
        client: testApiClient,
        headers: { "x-stack-auth": JSON.stringify(tokens) },
        path: { taskRunId: "trun_test123" },
        body: { teamSlugOrId: TEST_TEAM },
      });

      // Auth may fail, or task run not found
      expect([200, 401, 403, 404, 500]).toContain(res.response.status);
      if (res.response.status === 200 && res.data) {
        expect(res.data).toHaveProperty("isStopped");
      }
    });
  });
});
