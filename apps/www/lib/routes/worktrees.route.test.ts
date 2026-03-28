import { testApiClient } from "@/lib/test-utils/openapi-client";
import { postApiWorktreesRemove } from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("worktreesRouter via SDK", () => {
  describe("authentication", () => {
    it("POST /worktrees/remove rejects unauthenticated requests", async () => {
      const res = await postApiWorktreesRemove({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          worktreePath: "/tmp/test-worktree",
        },
      });
      expect(res.response.status).toBe(401);
    });

    it("POST /worktrees/remove returns 401 for unauthenticated POST", async () => {
      const res = await postApiWorktreesRemove({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          worktreePath: "/tmp/test-worktree",
        },
      });

      expect(res.response.status).toBe(401);
      // Middleware returns 401 without body - verify response is a standard auth rejection
      expect(res.response.ok).toBe(false);
    });
  });
});
