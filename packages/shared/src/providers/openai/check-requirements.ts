import type { ProviderRequirementsContext } from "../../agentConfig.js";

function hasNonEmptyValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function hasConfiguredCredentials(
  apiKeys?: ProviderRequirementsContext["apiKeys"]
): boolean {
  return (
    hasNonEmptyValue(apiKeys?.CODEX_AUTH_JSON) ||
    hasNonEmptyValue(apiKeys?.OPENAI_API_KEY)
  );
}

export async function checkOpenAIRequirements(
  ctx?: ProviderRequirementsContext
): Promise<string[]> {
  if (hasConfiguredCredentials(ctx?.apiKeys)) {
    return [];
  }

  if (ctx?.apiKeys) {
    return ["Codex Auth JSON or OpenAI API Key"];
  }

  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const codexDir = join(homedir(), ".codex");
  const requirements = [
    {
      path: join(codexDir, "auth.json"),
      missingLabel: ".codex/auth.json file",
    },
    {
      path: join(codexDir, "config.toml"),
      missingLabel: ".codex/config.toml file",
    },
  ] as const;

  const missing: string[] = [];

  for (const requirement of requirements) {
    try {
      await access(requirement.path);
    } catch {
      missing.push(requirement.missingLabel);
    }
  }

  return missing;
}
