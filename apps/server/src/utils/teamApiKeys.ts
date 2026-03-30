import { api } from "@cmux/convex/api";
import { getConvex } from "./convexClient.js";
import { serverLogger } from "./fileLogger";

type StoredApiKey = {
  envVar: string;
  value: string;
};

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ? `${error.message}\n${error.stack}` : error.message;
  }
  return String(error);
}

function buildApiKeyMap(apiKeys: StoredApiKey[]): Record<string, string> {
  const apiKeyMap: Record<string, string> = {};

  for (const key of apiKeys) {
    apiKeyMap[key.envVar] = key.value;
  }

  return apiKeyMap;
}

/**
 * Load team-scoped API keys for provider selection and agent spawning.
 *
 * Prefers the newer `getAllForAgents` query, but falls back to the older
 * `getAll` query so a partially deployed Convex bundle does not silently
 * misreport credentials as missing.
 */
export async function loadTeamApiKeysForAgents(
  teamSlugOrId: string
): Promise<Record<string, string>> {
  console.log(`[TeamApiKeys] Loading keys for team=${teamSlugOrId}`);
  const convex = getConvex();

  try {
    const apiKeys = await convex.query(api.apiKeys.getAllForAgents, {
      teamSlugOrId,
    });
    console.log(
      `[TeamApiKeys] Got ${Object.keys(apiKeys ?? {}).length} keys: [${Object.keys(apiKeys ?? {}).sort().join(", ")}]`
    );
    return apiKeys ?? {};
  } catch (error) {
    console.warn(
      `[TeamApiKeys] getAllForAgents failed for team=${teamSlugOrId}; falling back to getAll:`,
      formatError(error)
    );
    serverLogger.warn(
      `[TeamApiKeys] getAllForAgents failed for team=${teamSlugOrId}; falling back to getAll`,
      formatError(error)
    );
  }

  let apiKeyDocs: StoredApiKey[];
  try {
    apiKeyDocs = await convex.query(api.apiKeys.getAll, {
      teamSlugOrId,
    });
  } catch (error) {
    console.error(
      `[TeamApiKeys] Failed to load API keys for team=${teamSlugOrId} using getAll fallback:`,
      formatError(error)
    );
    serverLogger.error(
      `[TeamApiKeys] Failed to load API keys for team=${teamSlugOrId} using getAll fallback`,
      formatError(error)
    );
    throw error;
  }
  const apiKeys = buildApiKeyMap(apiKeyDocs);
  console.log(
    `[TeamApiKeys] Fallback got ${Object.keys(apiKeys).length} keys: [${Object.keys(apiKeys).sort().join(", ")}]`
  );
  return apiKeys;
}
