import { testApiClient } from "@/lib/test-utils/openapi-client";
import {
  postApiIntegrationsGithubPrsClose,
  postApiIntegrationsGithubPrsMergeSimple,
  postApiIntegrationsGithubPrsOpen,
  type PostApiIntegrationsGithubPrsOpenData,
} from "@cmux/www-openapi-client";
import { describe, expect, it } from "vitest";

const MOCK_TASK_RUN_ID: PostApiIntegrationsGithubPrsOpenData["body"]["taskRunId"] =
  "taskRuns:000000000000000000000000";

describe("GitHub PR routes via SDK", () => {
  it("rejects unauthenticated open requests", async () => {
    const res = await postApiIntegrationsGithubPrsOpen({
      client: testApiClient,
      body: {
        teamSlugOrId: "example-team",
        taskRunId: MOCK_TASK_RUN_ID,
      },
    });

    expect(res.response.status).toBe(401);
  });

  it("rejects unauthenticated close requests", async () => {
    const res = await postApiIntegrationsGithubPrsClose({
      client: testApiClient,
      body: {
        teamSlugOrId: "example-team",
        owner: "example-owner",
        repo: "example-repo",
        number: 123,
      },
    });

    expect(res.response.status).toBe(401);
  });

  it("rejects unauthenticated merge-simple requests", async () => {
    const res = await postApiIntegrationsGithubPrsMergeSimple({
      client: testApiClient,
      body: {
        teamSlugOrId: "example-team",
        owner: "example-owner",
        repo: "example-repo",
        number: 123,
        method: "squash",
      },
    });

    expect(res.response.status).toBe(401);
  });
});
