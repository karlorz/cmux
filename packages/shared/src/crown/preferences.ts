import type { CrownHarnessId } from "./types";

export type CrownHarnessProvider = "anthropic" | "openai";

export interface CrownHarnessConfig {
  id: CrownHarnessId;
  label: string;
  provider: CrownHarnessProvider;
  description: string;
  defaultModel: string;
  requiredApiKeyEnvVar?: string;
  allowsSystemFallback: boolean;
}

export const DEFAULT_CROWN_SYSTEM_PROMPT =
  "You select the best implementation from structured diff inputs and explain briefly why.";

export const DEFAULT_CROWN_HARNESS_ID: CrownHarnessId = "claude-code";

const HARNESS_DEFINITIONS = [
  {
    id: "claude-code",
    label: "Claude Code",
    provider: "anthropic",
    description: "Use Anthropic's Claude Code evaluator (system fallback available).",
    defaultModel: "claude-3-5-sonnet-20241022",
    requiredApiKeyEnvVar: "ANTHROPIC_API_KEY",
    allowsSystemFallback: true,
  },
  {
    id: "openai-evals",
    label: "OpenAI",
    provider: "openai",
    description: "Use OpenAI GPT models for crown evaluation.",
    defaultModel: "gpt-5-mini",
    requiredApiKeyEnvVar: "OPENAI_API_KEY",
    allowsSystemFallback: false,
  },
] as const satisfies ReadonlyArray<CrownHarnessConfig>;

export const CROWN_HARNESSES: ReadonlyArray<CrownHarnessConfig> =
  HARNESS_DEFINITIONS;

export const CROWN_HARNESS_MAP: Record<CrownHarnessId, CrownHarnessConfig> =
  HARNESS_DEFINITIONS.reduce<Record<CrownHarnessId, CrownHarnessConfig>>(
    (map, config) => {
      map[config.id] = config;
      return map;
    },
    Object.create(null) as Record<CrownHarnessId, CrownHarnessConfig>,
  );

