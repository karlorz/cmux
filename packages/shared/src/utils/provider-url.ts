/**
 * Unified provider URL normalization utilities.
 *
 * Different AI SDKs and raw fetch calls expect different URL formats:
 * - AI SDKs typically expect baseURL with version suffix (/v1, /v1beta)
 * - Raw fetch and CLI tools often expect origin-only URLs
 *
 * These normalizers handle both input formats and provide both output formats.
 *
 * Note: This module re-exports from provider-url-normalizer.ts which contains
 * the unified implementation. The functions here are adapters for backward compatibility.
 */

import { normalizeAnthropicBaseUrl, type NormalizedAnthropicBaseUrl } from "./anthropic";
import {
  normalizeOpenAIUrl as normalizeOpenAIUrlImpl,
  normalizeGoogleUrl as normalizeGoogleUrlImpl,
} from "./provider-url-normalizer";

/**
 * Normalized provider base URLs for different SDK contexts.
 */
export type NormalizedProviderUrl = {
  /** For AI SDK providers, which expect baseURL with version path */
  forAiSdk: string;
  /** For raw fetch calls, where callers append version path themselves */
  forRawFetch: string;
};

// Re-export Anthropic normalizer and type for unified access
export { normalizeAnthropicBaseUrl, type NormalizedAnthropicBaseUrl };

/**
 * Normalizes an OpenAI API base URL to consistent formats.
 * Handles URLs with or without /v1 suffix, including custom proxy paths.
 *
 * @param url - The base URL to normalize
 * @returns Object with normalized URLs for different SDK contexts
 *
 * @example
 * ```ts
 * normalizeOpenAiBaseUrl("https://api.openai.com")
 * // { forAiSdk: "https://api.openai.com/v1", forRawFetch: "https://api.openai.com" }
 *
 * normalizeOpenAiBaseUrl("https://api.openai.com/v1")
 * // { forAiSdk: "https://api.openai.com/v1", forRawFetch: "https://api.openai.com" }
 *
 * // Custom proxy paths are preserved
 * normalizeOpenAiBaseUrl("https://proxy.example.com/openai")
 * // { forAiSdk: "https://proxy.example.com/openai/v1", forRawFetch: "https://proxy.example.com/openai" }
 * ```
 */
export function normalizeOpenAiBaseUrl(url: string): NormalizedProviderUrl {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { forAiSdk: "", forRawFetch: "" };
  }

  try {
    const result = normalizeOpenAIUrlImpl(trimmed);
    // For OpenAI, forRawFetch still needs the /v1 suffix (unlike Anthropic)
    // because OpenAI CLI tools expect /v1 in the base URL
    const sdkUrl = result.forAiSdk();
    const rawUrl = sdkUrl.endsWith("/v1") ? sdkUrl.slice(0, -3) : sdkUrl;
    return {
      forAiSdk: sdkUrl,
      forRawFetch: rawUrl,
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
 * Normalizes a Gemini API base URL to consistent formats.
 * Handles URLs with or without /v1beta suffix, including custom proxy paths.
 *
 * Note: Gemini uses /v1beta instead of /v1 for its API version.
 *
 * @param url - The base URL to normalize
 * @returns Object with normalized URLs for different SDK contexts
 *
 * @example
 * ```ts
 * normalizeGeminiBaseUrl("https://generativelanguage.googleapis.com")
 * // { forAiSdk: "https://generativelanguage.googleapis.com/v1beta", forRawFetch: "https://generativelanguage.googleapis.com" }
 *
 * normalizeGeminiBaseUrl("https://generativelanguage.googleapis.com/v1beta")
 * // { forAiSdk: "https://generativelanguage.googleapis.com/v1beta", forRawFetch: "https://generativelanguage.googleapis.com" }
 *
 * // Custom proxy paths are preserved
 * normalizeGeminiBaseUrl("https://proxy.example.com/gemini")
 * // { forAiSdk: "https://proxy.example.com/gemini/v1beta", forRawFetch: "https://proxy.example.com/gemini" }
 *
 * // Wrong version suffix is corrected
 * normalizeGeminiBaseUrl("https://proxy.example.com/v1")
 * // { forAiSdk: "https://proxy.example.com/v1beta", forRawFetch: "https://proxy.example.com" }
 * ```
 */
export function normalizeGeminiBaseUrl(url: string): NormalizedProviderUrl {
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return { forAiSdk: "", forRawFetch: "" };
  }

  try {
    const result = normalizeGoogleUrlImpl(trimmed);
    const sdkUrl = result.forAiSdk();
    // Strip /v1beta suffix for forRawFetch
    const rawUrl = sdkUrl.endsWith("/v1beta") ? sdkUrl.slice(0, -7) : sdkUrl;
    return {
      forAiSdk: sdkUrl,
      forRawFetch: rawUrl,
    };
  } catch {
    // Fallback for invalid URLs - return as-is with basic cleanup
    const cleaned = trimmed.replace(/\/+$/, "");
    if (cleaned.endsWith("/v1beta")) {
      return {
        forAiSdk: cleaned,
        forRawFetch: cleaned.slice(0, -7),
      };
    }
    if (cleaned.endsWith("/v1")) {
      return {
        forAiSdk: `${cleaned.slice(0, -3)}/v1beta`,
        forRawFetch: cleaned.slice(0, -3),
      };
    }
    return {
      forAiSdk: `${cleaned}/v1beta`,
      forRawFetch: cleaned,
    };
  }
}

/**
 * Type for provider-specific URL normalizers.
 */
export type ProviderUrlNormalizer = (url: string) => NormalizedProviderUrl;

/**
 * Map of provider names to their URL normalizers.
 */
export const PROVIDER_URL_NORMALIZERS: Record<string, ProviderUrlNormalizer> = {
  anthropic: normalizeAnthropicBaseUrl,
  openai: normalizeOpenAiBaseUrl,
  gemini: normalizeGeminiBaseUrl,
  google: normalizeGeminiBaseUrl, // Alias for settings route compatibility
};

/**
 * Normalizes a provider base URL using the appropriate provider-specific normalizer.
 * Returns the origin form (forRawFetch) for use in settings connection tests.
 *
 * @param provider - The provider name (anthropic, openai, gemini, google)
 * @param url - The base URL to normalize
 * @returns The normalized URL (origin form without version suffix)
 */
export function normalizeProviderBaseUrlForRawFetch(
  provider: string,
  url: string
): string {
  const normalizer = PROVIDER_URL_NORMALIZERS[provider];
  if (!normalizer) {
    // Unknown provider - just clean trailing slashes
    return url.trim().replace(/\/+$/, "");
  }
  return normalizer(url).forRawFetch;
}
