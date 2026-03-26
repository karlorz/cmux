import type { AgentCatalogEntry } from "../../agent-catalog";

// Cursor supports browser login (auth.json) and API keys
// Browser login is recommended for normal use, API key for CI/automation
const CURSOR_REQUIRED_API_KEYS = ["CURSOR_AUTH_JSON", "CURSOR_API_KEY"];

export const CURSOR_CATALOG: AgentCatalogEntry[] = [
  {
    name: "cursor/opus-4.1",
    displayName: "Opus 4.1",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
  },
  {
    name: "cursor/gpt-5",
    displayName: "GPT-5",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
  },
  {
    name: "cursor/sonnet-4",
    displayName: "Sonnet 4",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
  },
  {
    name: "cursor/sonnet-4-thinking",
    displayName: "Sonnet 4 Thinking",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
    tags: ["reasoning"],
  },
];
