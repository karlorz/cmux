export const CLOUDFLARE_OPENAI_BASE_URL =
  "https://gateway.ai.cloudflare.com/v1/0c1675e0def6de1ab3a50a4e17dc5656/cmux-heatmap/openai";

// Placeholder key used when routing through the cmux proxy with platform credits
export const CMUX_OPENAI_PROXY_PLACEHOLDER_API_KEY =
  "sk_placeholder_cmux_openai_api_key";

/**
 * Normalize an OpenAI base URL for consistent usage.
 * Returns URL without trailing /v1 for raw fetch (proxy adds it).
 */
export function normalizeOpenAIBaseUrl(url: string): {
  forRawFetch: string;
  forSdk: string;
} {
  const trimmed = url.trim().replace(/\/+$/, "");
  const withoutV1 = trimmed.replace(/\/v1$/, "");
  return {
    forRawFetch: withoutV1,
    forSdk: withoutV1.endsWith("/v1") ? withoutV1 : `${withoutV1}/v1`,
  };
}
