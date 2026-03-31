import type {
  EnvironmentContext,
  EnvironmentResult,
} from "../common/environment-result";
import { buildOpenAICompatibleEnvironment } from "../common/openai-compatible-environment";

/**
 * Qwen CLI environment for OpenRouter.
 *
 * Uses OpenAI-compatible API with OpenRouter endpoint.
 * API key is provided via OPENROUTER_API_KEY env var (server maps to OPENAI_API_KEY).
 */
export async function getQwenOpenRouterEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpenAICompatibleEnvironment(ctx, {
    provider: "qwen",
    configDir: "qwen",
    instructionsPath: "/root/workspace/QWEN.md",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "qwen/qwen3-coder:free",
  });
}

/**
 * Qwen CLI environment for DashScope/ModelStudio.
 *
 * Uses OpenAI-compatible API with DashScope International endpoint.
 * API key is provided via DASHSCOPE_API_KEY env var (server maps to OPENAI_API_KEY).
 */
export async function getQwenModelStudioEnvironment(
  ctx: EnvironmentContext
): Promise<EnvironmentResult> {
  return buildOpenAICompatibleEnvironment(ctx, {
    provider: "qwen",
    configDir: "qwen",
    instructionsPath: "/root/workspace/QWEN.md",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    defaultModel: "qwen3-coder-plus",
  });
}
