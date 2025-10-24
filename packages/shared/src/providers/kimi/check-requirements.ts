export async function checkKimiRequirements(): Promise<string[]> {
  const missing: string[] = [];

  // Check if KIMI_API_KEY is provided
  const kimiApiKey = process.env.KIMI_API_KEY;
  if (!kimiApiKey) {
    missing.push("KIMI_API_KEY is not set");
  }

  return missing;
}
