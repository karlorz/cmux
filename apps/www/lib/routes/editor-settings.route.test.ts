import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  deleteApiEditorSettings,
  getApiEditorSettings,
  postApiEditorSettings,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const TEST_TEAM = process.env.CMUX_TEST_TEAM_SLUG || "example-team";

describe("editorSettingsRouter via SDK", () => {
  describe("authentication", () => {
    it("GET /editor-settings rejects unauthenticated requests", async () => {
      const res = await getApiEditorSettings({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });
      expect(res.response.status).toBe(401);
    });

    it("POST /editor-settings rejects unauthenticated requests", async () => {
      const res = await postApiEditorSettings({
        client: testApiClient,
        body: {
          teamSlugOrId: TEST_TEAM,
          settingsJson: "{}",
        },
      });
      expect(res.response.status).toBe(401);
    });

    it("DELETE /editor-settings rejects unauthenticated requests", async () => {
      const res = await deleteApiEditorSettings({
        client: testApiClient,
        query: { teamSlugOrId: TEST_TEAM },
      });
      expect(res.response.status).toBe(401);
    });
  });
});
