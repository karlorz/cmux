import type { ProviderRequirementsContext } from "../../agentConfig";

export async function checkOpenAIRequirements(
  context?: ProviderRequirementsContext
): Promise<string[]> {
  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  
  const missing: string[] = [];
  const hasApiKey = Boolean(context?.apiKeys?.OPENAI_API_KEY?.trim());

  // Check for .codex/auth.json (required for Codex CLI)
  try {
    await access(join(homedir(), ".codex", "auth.json"));
  } catch {
    if (!hasApiKey) {
      missing.push(".codex/auth.json file or OPENAI_API_KEY");
    }
  }

  // Check for .codex/config.toml (new preferred config)
  try {
    await access(join(homedir(), ".codex", "config.toml"));
  } catch {
    if (!hasApiKey) {
      missing.push(".codex/config.toml file or OPENAI_API_KEY");
    }
  }

  return missing;
}
