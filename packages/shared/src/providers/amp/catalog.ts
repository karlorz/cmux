import type { AgentCatalogEntry } from "../../agent-catalog";

export const AMP_CATALOG: AgentCatalogEntry[] = [
  {
    name: "amp",
    displayName: "AMP",
    vendor: "amp",
    requiredApiKeys: ["AMP_API_KEY"],
    tier: "paid",
    contextWindow: 200000,
    maxOutputTokens: 16384,
  },
  {
    name: "amp/gpt-5",
    displayName: "AMP GPT-5",
    vendor: "amp",
    requiredApiKeys: ["AMP_API_KEY"],
    tier: "paid",
    contextWindow: 256000,
    maxOutputTokens: 32000,
  },
];
