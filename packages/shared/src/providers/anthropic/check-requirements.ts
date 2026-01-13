import type { ProviderRequirementsContext } from "../../agentConfig";

/**
 * Check requirements for Claude Sonnet 4.5.
 *
 * Sonnet 4.5 is NOT available on AWS Bedrock, so it requires either:
 * - OAuth token (user's Claude subscription)
 * - Anthropic API key (user-provided)
 *
 * Unlike other Claude models, there is NO Bedrock fallback.
 */
export async function checkClaudeSonnetRequirements(
  context?: ProviderRequirementsContext,
): Promise<string[]> {
  const missing: string[] = [];

  // Check if user has provided OAuth token or API key in settings
  const hasOAuthToken =
    context?.apiKeys?.CLAUDE_CODE_OAUTH_TOKEN &&
    context.apiKeys.CLAUDE_CODE_OAUTH_TOKEN.trim() !== "";
  const hasApiKey =
    context?.apiKeys?.ANTHROPIC_API_KEY &&
    context.apiKeys.ANTHROPIC_API_KEY.trim() !== "";

  // Sonnet 4.5 requires OAuth or API key - no Bedrock fallback
  if (!hasOAuthToken && !hasApiKey) {
    missing.push(
      "Claude Sonnet 4.5 requires OAuth token or API key (not available on Bedrock)",
    );
  }

  return missing;
}

export async function checkClaudeRequirements(
  context?: ProviderRequirementsContext
): Promise<string[]> {
  const { access } = await import("node:fs/promises");
  const { homedir } = await import("node:os");
  const { join } = await import("node:path");
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const missing: string[] = [];

  // Check if API keys are provided in settings (from context)
  // Either CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY works
  const hasOAuthToken =
    context?.apiKeys?.CLAUDE_CODE_OAUTH_TOKEN &&
    context.apiKeys.CLAUDE_CODE_OAUTH_TOKEN.trim() !== "";
  const hasApiKeyInSettings =
    context?.apiKeys?.ANTHROPIC_API_KEY &&
    context.apiKeys.ANTHROPIC_API_KEY.trim() !== "";

  // If user has provided credentials via settings, skip local checks
  if (hasOAuthToken || hasApiKeyInSettings) {
    return missing;
  }

  try {
    // Check for .claude.json
    await access(join(homedir(), ".claude.json"));
  } catch {
    missing.push(".claude.json file");
  }

  try {
    // Check for credentials
    const hasCredentialsFile = await access(
      join(homedir(), ".claude", ".credentials.json")
    )
      .then(() => true)
      .catch(() => false);

    if (!hasCredentialsFile) {
      // Check for API key in keychain - try both Claude Code and Claude Code-credentials
      let foundInKeychain = false;

      try {
        await execAsync(
          "security find-generic-password -a $USER -w -s 'Claude Code'"
        );
        foundInKeychain = true;
      } catch {
        // Try Claude Code-credentials as fallback
        try {
          await execAsync(
            "security find-generic-password -a $USER -w -s 'Claude Code-credentials'"
          );
          foundInKeychain = true;
        } catch {
          // Neither keychain entry found
        }
      }

      if (!foundInKeychain) {
        missing.push(
          "Claude credentials (no .credentials.json, API key in keychain, or API key in Settings)"
        );
      }
    }
  } catch {
    missing.push("Claude credentials");
  }

  return missing;
}