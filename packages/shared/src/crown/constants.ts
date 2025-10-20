export type CrownModelProvider = "anthropic" | "openai";

export type CrownModelOption = {
  provider: CrownModelProvider;
  modelId: string;
  label: string;
  requiresEnvVars: readonly string[];
};

export const CROWN_MODEL_OPTIONS: readonly CrownModelOption[] = [
  {
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    label: "Claude 3.5 Sonnet (Oct 2024)",
    requiresEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    provider: "anthropic",
    modelId: "claude-3-5-haiku-20241022",
    label: "Claude 3.5 Haiku (Oct 2024)",
    requiresEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    provider: "anthropic",
    modelId: "claude-3-opus-20240229",
    label: "Claude 3 Opus (Feb 2024)",
    requiresEnvVars: ["ANTHROPIC_API_KEY"],
  },
  {
    provider: "openai",
    modelId: "gpt-5-mini",
    label: "GPT-5 Mini",
    requiresEnvVars: ["OPENAI_API_KEY"],
  },
  {
    provider: "openai",
    modelId: "o4-mini",
    label: "O4 Mini",
    requiresEnvVars: ["OPENAI_API_KEY"],
  },
];

export const CROWN_DEFAULT_PROVIDER: CrownModelProvider = "anthropic";

export const CROWN_DEFAULT_MODEL_BY_PROVIDER: Record<CrownModelProvider, string> = {
  anthropic: "claude-3-5-sonnet-20241022",
  openai: "gpt-5-mini",
};

export function findCrownModelOption(
  provider: CrownModelProvider,
  modelId: string,
): CrownModelOption | undefined {
  return CROWN_MODEL_OPTIONS.find(
    (option) => option.provider === provider && option.modelId === modelId,
  );
}
