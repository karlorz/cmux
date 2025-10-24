import type { AgentConfig } from "../../agentConfig";
import { KIMI_API_KEY } from "../../apiKeys";
import { checkKimiRequirements } from "./check-requirements";
import { startKimiCompletionDetector } from "./completion-detector";
import { getKimiEnvironment } from "./environment";

export const KIMI_DEFAULT_CONFIG: AgentConfig = {
  name: "kimi/default",
  command: "uvx",
  args: [
    "--python",
    "3.13",
    "kimi-cli@latest",
    "--print",
    "--command",
    "$PROMPT",
  ],
  environment: getKimiEnvironment,
  apiKeys: [KIMI_API_KEY],
  checkRequirements: checkKimiRequirements,
  completionDetector: startKimiCompletionDetector,
};
