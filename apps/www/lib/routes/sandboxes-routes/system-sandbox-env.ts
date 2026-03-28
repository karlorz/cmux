import { formatEnvVarsContent } from "@cmux/shared/utils/format-env-vars-content";

type BuildSystemSandboxEnvContentArgs = {
  taskRunId?: string;
  taskRunJwt?: string;
  taskRunJwtSecret?: string;
  isCloudWorkspace?: boolean;
  isOrchestrationHead?: boolean;
  callbackUrl?: string;
};

export function buildSystemSandboxEnvContent({
  taskRunId,
  taskRunJwt,
  taskRunJwtSecret,
  isCloudWorkspace,
  isOrchestrationHead,
  callbackUrl,
}: BuildSystemSandboxEnvContentArgs): string {
  const entries: Array<{ name: string; value: string }> = [];

  if (taskRunId) {
    entries.push({ name: "CMUX_TASK_RUN_ID", value: taskRunId });
  }

  if (taskRunJwt) {
    entries.push({ name: "CMUX_TASK_RUN_JWT", value: taskRunJwt });
    if (taskRunJwtSecret) {
      entries.push({
        name: "CMUX_TASK_RUN_JWT_SECRET",
        value: taskRunJwtSecret,
      });
    }
  }

  if (isOrchestrationHead) {
    entries.push({ name: "CMUX_IS_ORCHESTRATION_HEAD", value: "1" });
  }

  if (isCloudWorkspace) {
    entries.push({ name: "CMUX_IS_CLOUD_WORKSPACE", value: "1" });
  }

  if (callbackUrl) {
    entries.push({ name: "CMUX_CALLBACK_URL", value: callbackUrl });
  }

  return formatEnvVarsContent(entries);
}
