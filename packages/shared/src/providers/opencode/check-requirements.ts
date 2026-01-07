type ProviderRequirementsContext = {
  apiKeys?: Record<string, string>;
  teamSlugOrId?: string;
};

type OpencodeRequirementOptions = {
  requireAuth?: boolean;
};

export async function checkOpencodeRequirements(
  options: OpencodeRequirementOptions | ProviderRequirementsContext | undefined = {}
): Promise<string[]> {
  const { requireAuth = true } =
    "requireAuth" in (options as OpencodeRequirementOptions)
      ? (options as OpencodeRequirementOptions)
      : { requireAuth: true };

  if (!requireAuth) {
    return [];
  }

  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");

  const missing: string[] = [];

  try {
    // Check for auth.json
    await access(join(homedir(), ".local", "share", "opencode", "auth.json"));
  } catch {
    missing.push(".local/share/opencode/auth.json file");
  }

  return missing;
}

export function createOpencodeRequirementsChecker(
  options: OpencodeRequirementOptions
): (context?: ProviderRequirementsContext) => Promise<string[]> {
  return (_context) => checkOpencodeRequirements(options);
}
