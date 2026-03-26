import type { AgentConfig } from "../../agentConfig";
import { CURSOR_API_KEY, CURSOR_AUTH_JSON } from "../../apiKeys";
import { checkCursorRequirements } from "./check-requirements";
import { getCursorEnvironment } from "./environment";

// Factory types and implementation
interface CursorModelSpec {
  model: string;
}

function createCursorConfig(spec: CursorModelSpec): AgentConfig {
  return {
    name: `cursor/${spec.model}`,
    // Use "agent" (official name per Cursor docs) - "cursor-agent" is legacy symlink
    command: "/root/.local/bin/agent",
    args: ["--force", "--model", spec.model, "$PROMPT"],
    environment: getCursorEnvironment,
    checkRequirements: checkCursorRequirements,
    // Cursor supports browser login (auth.json) and API keys
    // Browser login is recommended for normal use, API key for CI/automation
    apiKeys: [CURSOR_AUTH_JSON, CURSOR_API_KEY],
    waitForString: "Ready",
  };
}

const CURSOR_MODEL_SPECS: CursorModelSpec[] = [
  { model: "opus-4.1" },
  { model: "gpt-5" },
  { model: "sonnet-4" },
  { model: "sonnet-4-thinking" },
];

export const CURSOR_AGENT_CONFIGS: AgentConfig[] =
  CURSOR_MODEL_SPECS.map(createCursorConfig);
