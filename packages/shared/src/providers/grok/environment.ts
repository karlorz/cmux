import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import { buildOpenAICompatibleEnvironment } from "../common/openai-compatible-environment";

/**
 * Grok CLI environment for xAI API.
 *
 * Uses OpenAI-compatible API with xAI endpoint.
 * API key is provided via XAI_API_KEY env var, mapped to OPENAI_API_KEY.
 */
export async function getGrokEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpenAICompatibleEnvironment(ctx, {
    provider: "grok",
    configDir: "grok",
    instructionsPath: "/root/workspace/GROK.md",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-code-fast-1",
    getApiKey: (c) => c.apiKeys?.XAI_API_KEY,
  });
}
