import { describe, expect, it } from "vitest";

import { buildSystemSandboxEnvContent } from "./system-sandbox-env";

describe("buildSystemSandboxEnvContent", () => {
  it("includes task run values and workspace flags", () => {
    expect(
      buildSystemSandboxEnvContent({
        taskRunId: "run_123",
        taskRunJwt: "jwt_123",
        taskRunJwtSecret: "secret_123",
        isCloudWorkspace: true,
        isOrchestrationHead: true,
      }),
    ).toBe(
      [
        'CMUX_TASK_RUN_ID="run_123"',
        'CMUX_TASK_RUN_JWT="jwt_123"',
        'CMUX_TASK_RUN_JWT_SECRET="secret_123"',
        'CMUX_IS_ORCHESTRATION_HEAD="1"',
        'CMUX_IS_CLOUD_WORKSPACE="1"',
      ].join("\n"),
    );
  });

  it("omits unset values", () => {
    expect(
      buildSystemSandboxEnvContent({
        taskRunId: "run_123",
      }),
    ).toBe('CMUX_TASK_RUN_ID="run_123"');
  });
});
