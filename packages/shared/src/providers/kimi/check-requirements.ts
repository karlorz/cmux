import type { ProviderRequirementsContext } from "../../agentConfig";

export async function checkKimiRequirements(
  context?: ProviderRequirementsContext
): Promise<string[]> {
  const { promisify } = await import("node:util");
  const { exec } = await import("node:child_process");

  const execAsync = promisify(exec);
  const missing: string[] = [];

  try {
    await execAsync("command -v kimi");
  } catch {
    missing.push(
      "Kimi CLI not found. Install with `uv tool install --python 3.13 kimi-cli` and ensure it is in your PATH."
    );
  }

  const apiKey =
    context?.apiKeys?.KIMI_API_KEY ?? process.env.KIMI_API_KEY ?? "";

  if (!apiKey || apiKey.trim().length === 0) {
    missing.push("KIMI_API_KEY not configured");
  }

  return missing;
}
