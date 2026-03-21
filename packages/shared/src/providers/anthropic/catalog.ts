import type { AgentCatalogEntry } from "../../agent-catalog";

export const CLAUDE_CATALOG: AgentCatalogEntry[] = [
  {
    name: "claude/opus-4.6",
    displayName: "Opus 4.6",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["latest", "recommended", "reasoning"],
    contextWindow: 1000000, // 1M context
    maxOutputTokens: 32000,
  },
  {
    name: "claude/opus-4.5",
    displayName: "Opus 4.5",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["reasoning"],
    contextWindow: 200000,
    maxOutputTokens: 16000,
  },
  {
    name: "claude/sonnet-4.5",
    displayName: "Sonnet 4.5",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["reasoning"],
    contextWindow: 200000,
    maxOutputTokens: 16000,
  },
  {
    name: "claude/haiku-4.5",
    displayName: "Haiku 4.5",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["fast"],
    contextWindow: 200000,
    maxOutputTokens: 8000,
  },
];
