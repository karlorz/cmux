export async function checkKimiRequirements(): Promise<string[]> {
  const { exec } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execAsync = promisify(exec);

  const missing: string[] = [];

  try {
    // Check if kimi command is available
    await execAsync("which kimi");
  } catch {
    missing.push("kimi CLI not found. Install with: uv tool install kimi-cli");
  }

  return missing;
}