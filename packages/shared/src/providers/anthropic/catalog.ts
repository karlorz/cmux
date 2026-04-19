import type { AgentCatalogEntry } from "../../agent-catalog";

export const CLAUDE_CATALOG: AgentCatalogEntry[] = [
  {
    name: "claude/opus-4.7",
    displayName: "Opus 4.7",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["latest", "recommended", "reasoning"],
    variants: [
      {
        id: "low",
        displayName: "Low",
        description: "Lower thinking effort for faster responses",
      },
      {
        id: "medium",
        displayName: "Medium",
        description: "Balanced thinking effort for everyday work",
      },
      {
        id: "high",
        displayName: "High",
        description: "Higher thinking effort for complex tasks",
      },
      {
        id: "max",
        displayName: "Max",
        description: "Maximum thinking effort supported by Opus 4.7",
      },
    ],
    defaultVariant: "medium",
    contextWindow: 1000000, // 1M context
    maxOutputTokens: 128000,
  },
  {
    name: "claude/opus-4.6",
    displayName: "Opus 4.6",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["reasoning"],
    variants: [
      {
        id: "low",
        displayName: "Low",
        description: "Lower thinking effort for faster responses",
      },
      {
        id: "medium",
        displayName: "Medium",
        description: "Balanced thinking effort for everyday work",
      },
      {
        id: "high",
        displayName: "High",
        description: "Higher thinking effort for complex tasks",
      },
      {
        id: "max",
        displayName: "Max",
        description: "Maximum thinking effort supported by Opus 4.6",
      },
    ],
    defaultVariant: "medium",
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
    variants: [],
    contextWindow: 200000,
    maxOutputTokens: 16000,
  },
  {
    name: "claude/sonnet-4.6",
    displayName: "Sonnet 4.6",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["latest", "reasoning"],
    variants: [
      {
        id: "low",
        displayName: "Low",
        description: "Lower thinking effort for faster responses",
      },
      {
        id: "medium",
        displayName: "Medium",
        description: "Balanced thinking effort for everyday work",
      },
      {
        id: "high",
        displayName: "High",
        description: "Higher thinking effort for complex tasks",
      },
      {
        id: "max",
        displayName: "Max",
        description: "Maximum thinking effort supported by Sonnet 4.6",
      },
    ],
    defaultVariant: "medium",
    contextWindow: 1000000, // 1M context
    maxOutputTokens: 32000,
  },
  {
    name: "claude/sonnet-4.5",
    displayName: "Sonnet 4.5",
    vendor: "anthropic",
    requiredApiKeys: ["CLAUDE_CODE_OAUTH_TOKEN", "ANTHROPIC_API_KEY"],
    tier: "paid",
    tags: ["reasoning"],
    variants: [],
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
    variants: [],
    contextWindow: 200000,
    maxOutputTokens: 8000,
  },
];
