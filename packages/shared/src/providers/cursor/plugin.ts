/**
 * Cursor Provider Plugin.
 * Provides Cursor agent configurations.
 */

import type { ProviderPlugin } from "../plugin-interface";
import { CURSOR_API_KEY, CURSOR_AUTH_JSON } from "../../apiKeys";
import { CURSOR_CATALOG } from "./catalog";
import { CURSOR_AGENT_CONFIGS } from "./configs";

export const cursorPlugin: ProviderPlugin = {
  manifest: {
    id: "cursor",
    name: "Cursor",
    version: "1.0.0",
    description: "Cursor agent for AI-powered code editing",
    type: "builtin",
  },
  provider: {
    defaultBaseUrl: "https://api.cursor.sh",
    apiFormat: "passthrough",
    // Cursor supports browser login (auth.json) and API keys
    // Browser login is recommended for normal use, API key for CI/automation
    authEnvVars: ["CURSOR_API_KEY"],
    apiKeys: [CURSOR_AUTH_JSON, CURSOR_API_KEY],
  },
  configs: CURSOR_AGENT_CONFIGS,
  catalog: CURSOR_CATALOG,
};

export default cursorPlugin;
