import { describe, it, expect, vi, beforeEach } from "vitest";
import { hooksDispatchRouter } from "./hooks.dispatch.route";

// Mock the JWT verification module
vi.mock("@/lib/utils/jwt-task-run", () => ({
  extractTaskRunJwtFromRequest: vi.fn(),
  verifyTaskRunJwt: vi.fn(),
}));

// Import mocked functions
import {
  extractTaskRunJwtFromRequest,
  verifyTaskRunJwt,
} from "@/lib/utils/jwt-task-run";

describe("hooks.dispatch.route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("GET /hooks/dispatch", () => {
    it("returns 401 when no token is provided", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue(null);

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_start&provider=claude",
        {
          method: "GET",
        }
      );

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("missing x-cmux-token");
    });

    it("returns 401 when token is invalid", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("invalid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue(null);

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_start&provider=claude",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "invalid-token",
          },
        }
      );

      expect(res.status).toBe(401);
      const text = await res.text();
      expect(text).toContain("invalid JWT");
    });

    it("returns 400 for invalid provider", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_start&provider=invalid-provider",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("Invalid provider");
    });

    it("returns 400 for invalid event type", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=invalid_event&provider=claude",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(400);
      const text = await res.text();
      expect(text).toContain("Invalid event type");
    });

    it("returns 404 when hook is not supported for provider", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      // context_warning is only supported by claude
      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=context_warning&provider=codex",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(404);
      const text = await res.text();
      expect(text).toContain("not supported");
    });

    it("returns valid shell script for supported hook", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_start&provider=claude",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/plain");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=60");

      const script = await res.text();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("session_start");
      expect(script).toContain("claude");
    });

    it("returns session_stop script with memory sync", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_stop&provider=claude",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(200);
      const script = await res.text();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("sync.sh");
      expect(script).toContain("session_stop");
    });

    it("returns script for codex provider", async () => {
      vi.mocked(extractTaskRunJwtFromRequest).mockReturnValue("valid-token");
      vi.mocked(verifyTaskRunJwt).mockResolvedValue({
        taskRunId: "test-run",
        teamId: "test-team",
        userId: "test-user",
      });

      const res = await hooksDispatchRouter.request(
        "/hooks/dispatch?event=session_start&provider=codex",
        {
          method: "GET",
          headers: {
            "x-cmux-token": "valid-token",
          },
        }
      );

      expect(res.status).toBe(200);
      const script = await res.text();
      expect(script).toContain("#!/bin/bash");
      expect(script).toContain("codex");
    });
  });
});
