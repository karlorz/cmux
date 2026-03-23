import { describe, expect, it } from "vitest";
import { buildTaskRunCreateArgs } from "./taskRunCreateArgs";

describe("buildTaskRunCreateArgs", () => {
  it("preserves true for orchestration head runs", () => {
    const result = buildTaskRunCreateArgs({
      teamSlugOrId: "team-1",
      taskId: "task_123",
      prompt: "Cloud Workspace",
      agentName: "cloud-workspace",
      environmentId: "env_123",
      isOrchestrationHead: true,
    });

    expect(result).toMatchObject({
      teamSlugOrId: "team-1",
      prompt: "Cloud Workspace",
      agentName: "cloud-workspace",
      environmentId: "env_123",
      isOrchestrationHead: true,
    });
  });

  it("preserves explicit false instead of omitting the flag", () => {
    const result = buildTaskRunCreateArgs({
      teamSlugOrId: "team-1",
      taskId: "task_123",
      prompt: "regular run",
      isOrchestrationHead: false,
    });

    expect("isOrchestrationHead" in result).toBe(true);
    expect(result.isOrchestrationHead).toBe(false);
  });

  it("omits undefined optional fields", () => {
    const result = buildTaskRunCreateArgs({
      teamSlugOrId: "team-1",
      taskId: "task_123",
      prompt: "regular run",
    });

    expect(result).toEqual({
      teamSlugOrId: "team-1",
      taskId: "task_123",
      prompt: "regular run",
    });
  });
});
