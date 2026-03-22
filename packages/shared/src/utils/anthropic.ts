/**
 * Utilities for working with Anthropic API configuration.
 */

import { normalizeAnthropicUrl as normalizeAnthropicUrlImpl } from "./provider-url-normalizer";

/** Cloudflare AI Gateway URL for proxying Anthropic requests */
export const CLOUDFLARE_ANTHROPIC_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/0c1675e0def6de1ab3a50a4e17dc5656/cmux-ai-proxy/anthropic";

/** Placeholder API key used when routing through cmux proxy */
export const CMUX_ANTHROPIC_PROXY_PLACEHOLDER_API_KEY =
  "sk_placeholder_cmux_anthropic_api_key";

/**
 * Normalized Anthropic base URLs for different SDK contexts.
 */
export type NormalizedAnthropicBaseUrl = {
  /** For AI SDK providers (createAnthropic), which expect baseURL to include /v1 */
  forAiSdk: string;
  /** For raw fetch + Claude Code ANTHROPIC_BASE_URL, where callers append /v1/* */
  forRawFetch: string;
};

/**
 * Normalizes an Anthropic API base URL to consistent formats.
 * Handles both URLs with and without /v1 suffix, including custom proxy paths.
 *
 * @param url - The base URL to normalize
 * @returns Object with normalized URLs for different SDK contexts
 *
 * @example
 * ```ts
 * normalizeAnthropicBaseUrl("https://api.anthropic.com")
 * // { forAiSdk: "https://api.anthropic.com/v1", forRawFetch: "https://api.anthropic.com" }
 *
 * normalizeAnthropicBaseUrl("https://api.anthropic.com/v1")
 * // { forAiSdk: "https://api.anthropic.com/v1", forRawFetch: "https://api.anthropic.com" }
 *
 * // Custom proxy paths are preserved
 * normalizeAnthropicBaseUrl("https://proxy.example.com/anthropic")
 * // { forAiSdk: "https://proxy.example.com/anthropic/v1", forRawFetch: "https://proxy.example.com/anthropic" }
 * ```
 */
export function normalizeAnthropicBaseUrl(
  url: string,
): NormalizedAnthropicBaseUrl {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { forAiSdk: "", forRawFetch: "" };
  }

  try {
    const result = normalizeAnthropicUrlImpl(trimmed);
    return {
      forAiSdk: result.forAiSdk(),
      forRawFetch: result.forCliOrRawFetch(),
    };
  } catch {
    // Fallback for invalid URLs - return as-is with basic cleanup
    const cleaned = trimmed.replace(/\/+$/, "");
    return {
      forAiSdk: cleaned.endsWith("/v1") ? cleaned : `${cleaned}/v1`,
      forRawFetch: cleaned.endsWith("/v1") ? cleaned.slice(0, -3) : cleaned,
    };
  }
}

/**
 * AWS Bedrock model IDs for Claude models.
 * Used by code review heatmap feature.
 */
export const ANTHROPIC_MODEL_OPUS_46 = "global.anthropic.claude-opus-4-6-v1";
export const ANTHROPIC_MODEL_OPUS_45 =
  "global.anthropic.claude-opus-4-5-20251101-v1:0";
export const ANTHROPIC_MODEL_HAIKU_45 =
  "us.anthropic.claude-haiku-4-5-20251001-v1:0";
export const BEDROCK_AWS_REGION = "us-east-1";
