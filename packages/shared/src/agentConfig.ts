import type {
  EnvironmentContext,
  EnvironmentResult,
} from "./providers/common/environment-result";

import { AMP_AGENT_CONFIGS } from "./providers/amp/configs";
import { CLAUDE_AGENT_CONFIGS } from "./providers/anthropic/configs";
import { CURSOR_AGENT_CONFIGS } from "./providers/cursor/configs";
import { GEMINI_AGENT_CONFIGS } from "./providers/gemini/configs";
import { CODEX_AGENT_CONFIGS } from "./providers/openai/configs";
import { OPENCODE_AGENT_CONFIGS } from "./providers/opencode/configs";
import { QWEN_AGENT_CONFIGS } from "./providers/qwen/configs";

export { checkGitStatus } from "./providers/common/check-git";

export { type EnvironmentResult };

export type AgentConfigApiKey = {
  envVar: string;
  displayName: string;
  description?: string;
  // Optionally inject this key value under a different environment variable
  // name when launching the agent process.
  mapToEnvVar?: string;
};
export type AgentConfigApiKeys = Array<AgentConfigApiKey>;

export type ProviderRequirementsContext = {
  apiKeys?: Record<string, string>;
  teamSlugOrId?: string;
};

export interface AgentConfig {
  name: string;
  command: string;
  args: string[];
  apiKeys?: AgentConfigApiKeys;
  environment?: (ctx: EnvironmentContext) => Promise<EnvironmentResult>;
  applyApiKeys?: (
    keys: Record<string, string>,
  ) => Promise<Partial<EnvironmentResult>> | Partial<EnvironmentResult>; // Optional hook to apply API keys into env/files/startup commands instead of default env var injection
  waitForString?: string;
  enterKeySequence?: string; // Custom enter key sequence, defaults to "\r"
  checkRequirements?: (
    context?: ProviderRequirementsContext,
  ) => Promise<string[]>; // Returns list of missing requirements
  completionDetector?: (taskRunId: string) => Promise<void>;
  disabled?: boolean; // When true, agent is shown in UI but not selectable
  disabledReason?: string; // Reason shown in tooltip when disabled
}

export const AGENT_CONFIGS: AgentConfig[] = [
  ...CLAUDE_AGENT_CONFIGS,
  ...CODEX_AGENT_CONFIGS,
  ...AMP_AGENT_CONFIGS,
  ...OPENCODE_AGENT_CONFIGS,
  ...GEMINI_AGENT_CONFIGS,
  ...QWEN_AGENT_CONFIGS,
  ...CURSOR_AGENT_CONFIGS,
];
