import type { AgentConfig } from "../../agentConfig";
import { CURSOR_API_KEY, CURSOR_AUTH_JSON } from "../../apiKeys";
import { checkCursorRequirements } from "./check-requirements";
import { startCursorCompletionDetector } from "./completion-detector";
import { getCursorEnvironment } from "./environment";

// Factory types and implementation
interface CursorModelSpec {
  model: string;
  /** Use non-interactive mode with --output-format json for CI/automation */
  nonInteractive?: boolean;
}

/**
 * Creates a Cursor agent config.
 *
 * Two modes are supported:
 * - Interactive (default): Uses waitForString="Ready" for TUI mode
 * - Non-interactive: Uses --output-format json and completionDetector for CI/automation
 *
 * Per Cursor CLI docs, non-interactive mode provides structured JSON output
 * including session_id and request_id for orchestration tracking.
 */
function createCursorConfig(spec: CursorModelSpec): AgentConfig {
  const baseConfig = {
    name: `cursor/${spec.model}`,
    // Use "agent" (official name per Cursor docs) - "cursor-agent" is legacy symlink
    command: "/root/.local/bin/agent",
    environment: getCursorEnvironment,
    checkRequirements: checkCursorRequirements,
    // Cursor supports browser login (auth.json) and API keys
    // Browser login is recommended for normal use, API key for CI/automation
    apiKeys: [CURSOR_AUTH_JSON, CURSOR_API_KEY],
  };

  if (spec.nonInteractive) {
    // Non-interactive mode: use --output-format json for structured output
    // and completionDetector for file-marker-based completion detection
    return {
      ...baseConfig,
      name: `cursor/${spec.model}-ci`,
      args: [
        "--force",
        "--model", spec.model,
        "--output-format", "json",
        "-p", "$PROMPT",
      ],
      completionDetector: startCursorCompletionDetector,
    };
  }

  // Interactive mode (default): use TUI with waitForString
  return {
    ...baseConfig,
    args: ["--force", "--model", spec.model, "$PROMPT"],
    waitForString: "Ready",
  };
}

const CURSOR_MODEL_SPECS: CursorModelSpec[] = [
  { model: "opus-4.1" },
  { model: "gpt-5" },
  { model: "sonnet-4" },
  { model: "sonnet-4-thinking" },
];

// Non-interactive variants for CI/automation (with -ci suffix)
const CURSOR_CI_MODEL_SPECS: CursorModelSpec[] = [
  { model: "opus-4.1", nonInteractive: true },
  { model: "gpt-5", nonInteractive: true },
  { model: "sonnet-4", nonInteractive: true },
  { model: "sonnet-4-thinking", nonInteractive: true },
];

export const CURSOR_AGENT_CONFIGS: AgentConfig[] = [
  ...CURSOR_MODEL_SPECS.map(createCursorConfig),
  ...CURSOR_CI_MODEL_SPECS.map(createCursorConfig),
];
