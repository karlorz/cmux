import type { AgentCatalogEntry } from "../../agent-catalog";

// Cursor supports browser login (auth.json) and API keys
// Browser login is recommended for normal use, API key for CI/automation
const CURSOR_REQUIRED_API_KEYS = ["CURSOR_AUTH_JSON", "CURSOR_API_KEY"];

export const CURSOR_CATALOG: AgentCatalogEntry[] = [
  // Interactive models (TUI mode)
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
  // Non-interactive CI models (--output-format json)
  {
    name: "cursor/opus-4.1-ci",
    displayName: "Opus 4.1 (CI)",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
    tags: ["ci", "automation"],
  },
  {
    name: "cursor/gpt-5-ci",
    displayName: "GPT-5 (CI)",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
    tags: ["ci", "automation"],
  },
  {
    name: "cursor/sonnet-4-ci",
    displayName: "Sonnet 4 (CI)",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
    tags: ["ci", "automation"],
  },
  {
    name: "cursor/sonnet-4-thinking-ci",
    displayName: "Sonnet 4 Thinking (CI)",
    vendor: "cursor",
    requiredApiKeys: CURSOR_REQUIRED_API_KEYS,
    tier: "paid",
    tags: ["reasoning", "ci", "automation"],
  },
];
