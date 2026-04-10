export type ClaudeModelFamily = "opus" | "sonnet" | "haiku";

export interface ClaudeModelSpec {
  nameSuffix: string;
  family: ClaudeModelFamily;
  nativeModelId: string;
}

export const CLAUDE_MODEL_SPECS: ClaudeModelSpec[] = [
  {
    nameSuffix: "opus-4.6",
    family: "opus",
    nativeModelId: "claude-opus-4-6",
  },
  {
    nameSuffix: "sonnet-4.6",
    family: "sonnet",
    nativeModelId: "claude-sonnet-4-6",
  },
  {
    nameSuffix: "opus-4.5",
    family: "opus",
    nativeModelId: "claude-opus-4-5-20251101",
  },
  {
    nameSuffix: "sonnet-4.5",
    family: "sonnet",
    nativeModelId: "claude-sonnet-4-5-20250929",
  },
  {
    nameSuffix: "haiku-4.5",
    family: "haiku",
    nativeModelId: "claude-haiku-4-5-20251001",
  },
];

export function getClaudeModelSpecByAgentName(
  agentName: string | undefined,
): ClaudeModelSpec | undefined {
  if (!agentName?.startsWith("claude/")) {
    return undefined;
  }

  return CLAUDE_MODEL_SPECS.find(
    (spec) => agentName === `claude/${spec.nameSuffix}`,
  );
}

export function getClaudeModelFamily(
  agentName: string | undefined,
): ClaudeModelFamily | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.family;
}

export function getClaudeNativeModelId(
  agentName: string | undefined,
): string | undefined {
  return getClaudeModelSpecByAgentName(agentName)?.nativeModelId;
}
