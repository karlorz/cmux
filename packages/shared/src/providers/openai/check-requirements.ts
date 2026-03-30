import type { ProviderRequirementsContext } from "../../agentConfig.js";

export async function checkOpenAIRequirements(
  ctx?: ProviderRequirementsContext
): Promise<string[]> {
  const missing: string[] = [];

  // If apiKeys are provided (from Convex in web mode), check those instead of local files
  if (ctx?.apiKeys) {
    const hasAuthJson =
      ctx.apiKeys.CODEX_AUTH_JSON &&
      ctx.apiKeys.CODEX_AUTH_JSON.trim() !== "";
    const hasApiKey =
      ctx.apiKeys.OPENAI_API_KEY && ctx.apiKeys.OPENAI_API_KEY.trim() !== "";

    if (!hasAuthJson && !hasApiKey) {
      missing.push("Codex Auth JSON or OpenAI API Key");
    }
    return missing;
  }

  // Fallback to local file checks (for local dev without Convex)
  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  // Check for .codex/auth.json (required for Codex CLI)
  try {
    await access(join(homedir(), ".codex", "auth.json"));
  } catch {
    missing.push(".codex/auth.json file");
  }

  // Check for .codex/config.toml (new preferred config)
  try {
    await access(join(homedir(), ".codex", "config.toml"));
  } catch {
    missing.push(".codex/config.toml file");
  }

  return missing;
}
