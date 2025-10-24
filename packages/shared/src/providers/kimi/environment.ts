import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";

export async function getKimiEnvironment(
  _ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  const files: EnvironmentResult["files"] = [];
  const env: Record<string, string> = {};
  const startupCommands: string[] = [];

  // Ensure any necessary directories exist
  startupCommands.push("mkdir -p ~/.config/kimi");

  // If MOONSHOT_API_KEY is set, pass it through
  if (process.env.MOONSHOT_API_KEY) {
    env.MOONSHOT_API_KEY = process.env.MOONSHOT_API_KEY;
  }

  return { files, env, startupCommands };
}