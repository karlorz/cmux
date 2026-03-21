import type { AgentCatalogEntry } from "../../agent-catalog";

export const GROK_CATALOG: AgentCatalogEntry[] = [
  {
    name: "grok/grok-code-fast-1",
    displayName: "Grok Code Fast 1",
    vendor: "xai",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
    tags: ["default", "fast"],
    contextWindow: 131072,
    maxOutputTokens: 16384,
  },
  {
    name: "grok/grok-4-latest",
    displayName: "Grok 4 Latest",
    vendor: "xai",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
    tags: ["latest"],
    contextWindow: 256000,
    maxOutputTokens: 32000,
  },
  {
    name: "grok/grok-3-latest",
    displayName: "Grok 3 Latest",
    vendor: "xai",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
    contextWindow: 131072,
    maxOutputTokens: 16384,
  },
  {
    name: "grok/grok-3-fast",
    displayName: "Grok 3 Fast",
    vendor: "xai",
    requiredApiKeys: ["XAI_API_KEY"],
    tier: "paid",
    tags: ["fast"],
    contextWindow: 131072,
    maxOutputTokens: 8192,
  },
];
