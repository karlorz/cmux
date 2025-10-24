import type { AgentConfig } from "../../agentConfig";
import { KIMI_API_KEY } from "../../apiKeys";
import { checkKimiRequirements } from "./check-requirements";
import { getKimiEnvironment } from "./environment";

export const KIMI_K2_CONFIG: AgentConfig = {
  name: "kimi/k2",
  command: "prompt-wrapper",
  args: [
    "--prompt-env",
    "CMUX_PROMPT",
    "--",
    "kimi",
    "--print",
    "--input-format",
    "text",
    "--output-format",
    "text",
  ],
  environment: getKimiEnvironment,
  apiKeys: [KIMI_API_KEY],
  checkRequirements: checkKimiRequirements,
};
