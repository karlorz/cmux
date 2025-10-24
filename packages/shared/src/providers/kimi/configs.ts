import type { AgentConfig } from "../../agentConfig";
import { MOONSHOT_API_KEY } from "../../apiKeys";
import { checkKimiRequirements } from "./check-requirements";
import { getKimiEnvironment } from "./environment";

export const KIMI_CONFIG: AgentConfig = {
  name: "kimi",
  command: "kimi",
  args: ["--prompt", "$PROMPT"],
  environment: getKimiEnvironment,
  checkRequirements: checkKimiRequirements,
  apiKeys: [MOONSHOT_API_KEY],
};