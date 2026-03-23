/**
 * Provider URL Normalizer
 *
 * Unified URL normalization for AI provider base URLs.
 * Handles the difference between stored/user-entered values (bare origins or full paths)
 * and runtime-ready URLs needed by different consumers (AI SDK, CLI, raw fetch).
 *
 * Supported providers:
 * - Anthropic: CLI/raw expects no suffix, AI SDK expects /v1
 * - OpenAI: Both SDK and CLI expect /v1
 * - Google/Gemini: AI SDK expects /v1beta
 *
 * @example
 * ```ts
 * const normalizer = normalizeProviderUrl('https://proxy.example.com', 'anthropic');
 * normalizer.forCliOrRawFetch(); // 'https://proxy.example.com'
 * normalizer.forAiSdk();         // 'https://proxy.example.com/v1'
 *
 * const openai = normalizeProviderUrl('https://proxy.example.com/v1', 'openai');
 * openai.forAiSdk();             // 'https://proxy.example.com/v1'
 *
 * const gemini = normalizeProviderUrl('https://proxy.example.com', 'google');
 * gemini.forAiSdk();             // 'https://proxy.example.com/v1beta'
 * ```
 */

export type SupportedProvider = "anthropic" | "openai" | "google";

/**
 * Provider-specific canonical path suffixes.
 */
const PROVIDER_SUFFIXES: Record<SupportedProvider, string> = {
  anthropic: "/v1",
  openai: "/v1",
  google: "/v1beta",
};

/**
 * Known version path patterns that should be normalized.
 * Used to detect when a URL already has a version suffix.
 */
const VERSION_PATH_PATTERNS = ["/v1", "/v1beta", "/v2"];

/**
 * Result of normalizing a provider URL.
 * Provides methods to get the URL in different formats for different consumers.
 */
export interface ProviderUrlNormalizationResult {
  /** Original input URL (trimmed) */
  readonly original: string;
  /** Provider this URL was normalized for */
  readonly provider: SupportedProvider;
  /** Whether the input had a custom non-root path */
  readonly hasCustomPath: boolean;
  /** Get URL for CLI tools and raw fetch (Anthropic: no /v1 suffix) */
  forCliOrRawFetch(): string;
  /** Get URL for AI SDK consumers (includes provider-appropriate suffix) */
  forAiSdk(): string;
  /** Get the base origin without any path */
  getOrigin(): string;
}

/**
 * Check if a pathname is a root-level version path (like /v1 or /v1beta).
 */
function isRootVersionPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, ""); // Remove trailing slashes
  return VERSION_PATH_PATTERNS.includes(normalized);
}

/**
 * Check if a pathname has a custom (non-root, non-version) path.
 * Examples of custom paths: /proxy/anthropic, /api/v1/chat
 */
function hasCustomPath(pathname: string): boolean {
  const normalized = pathname.replace(/\/+$/, ""); // Remove trailing slashes
  if (!normalized || normalized === "/") {
    return false;
  }
  // If it's just a version path at root, it's not custom
  if (isRootVersionPath(normalized)) {
    return false;
  }
  return true;
}

/**
 * Remove a trailing version suffix from a pathname.
 * Used to normalize URLs that already have /v1 or /v1beta.
 */
function removeTrailingVersionSuffix(pathname: string): string {
  let result = pathname.replace(/\/+$/, ""); // Remove trailing slashes first
  for (const suffix of VERSION_PATH_PATTERNS) {
    if (result.endsWith(suffix)) {
      result = result.slice(0, -suffix.length);
      break;
    }
  }
  return result || "/";
}

/**
 * Normalize a provider base URL for runtime use.
 *
 * @param input - The URL to normalize (bare origin, with /v1, or custom path)
 * @param provider - The provider this URL is for
 * @returns A ProviderUrlNormalizationResult with methods to get format-specific URLs
 *
 * @throws Error if the input is not a valid URL
 */
export function normalizeProviderUrl(
  input: string,
  provider: SupportedProvider
): ProviderUrlNormalizationResult {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("Provider URL cannot be empty");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`Invalid provider URL: ${trimmed}`);
  }

  const origin = url.origin;
  const pathname = url.pathname;
  const suffix = PROVIDER_SUFFIXES[provider];
  const isCustomPath = hasCustomPath(pathname);

  // Determine the base path (without version suffix)
  let basePath: string;
  if (isCustomPath) {
    // Custom path: preserve it but remove any trailing version suffix
    basePath = removeTrailingVersionSuffix(pathname);
  } else {
    // Root or root-version path: normalize to root
    basePath = "";
  }

  return {
    original: trimmed,
    provider,
    hasCustomPath: isCustomPath,

    forCliOrRawFetch(): string {
      // Anthropic CLI/raw fetch: no /v1 suffix needed
      // Other providers: include the suffix even for CLI
      if (provider === "anthropic") {
        return basePath ? `${origin}${basePath}` : origin;
      }
      // OpenAI and Google: CLI tools typically still want the versioned path
      const fullPath = basePath ? `${basePath}${suffix}` : suffix;
      return `${origin}${fullPath}`;
    },

    forAiSdk(): string {
      // All providers: AI SDK expects the versioned path
      const fullPath = basePath ? `${basePath}${suffix}` : suffix;
      return `${origin}${fullPath}`;
    },

    getOrigin(): string {
      return origin;
    },
  };
}

/**
 * Convenience function to get AI SDK-ready URL directly.
 */
export function toAiSdkUrl(
  input: string,
  provider: SupportedProvider
): string {
  return normalizeProviderUrl(input, provider).forAiSdk();
}

/**
 * Convenience function to get CLI/raw-fetch-ready URL directly.
 */
export function toCliUrl(
  input: string,
  provider: SupportedProvider
): string {
  return normalizeProviderUrl(input, provider).forCliOrRawFetch();
}

/**
 * Normalize an Anthropic base URL for different consumers.
 *
 * @example
 * ```ts
 * normalizeAnthropicUrl('https://proxy.com').forCliOrRawFetch()  // 'https://proxy.com'
 * normalizeAnthropicUrl('https://proxy.com').forAiSdk()          // 'https://proxy.com/v1'
 * normalizeAnthropicUrl('https://proxy.com/v1').forCliOrRawFetch() // 'https://proxy.com'
 * ```
 */
export function normalizeAnthropicUrl(input: string): ProviderUrlNormalizationResult {
  return normalizeProviderUrl(input, "anthropic");
}

/**
 * Normalize an OpenAI base URL for different consumers.
 *
 * @example
 * ```ts
 * normalizeOpenAIUrl('https://proxy.com').forAiSdk()     // 'https://proxy.com/v1'
 * normalizeOpenAIUrl('https://proxy.com/v1').forAiSdk()  // 'https://proxy.com/v1'
 * ```
 */
export function normalizeOpenAIUrl(input: string): ProviderUrlNormalizationResult {
  return normalizeProviderUrl(input, "openai");
}

/**
 * Normalize a Google/Gemini base URL for different consumers.
 *
 * @example
 * ```ts
 * normalizeGoogleUrl('https://proxy.com').forAiSdk()       // 'https://proxy.com/v1beta'
 * normalizeGoogleUrl('https://proxy.com/v1').forAiSdk()    // 'https://proxy.com/v1beta'
 * normalizeGoogleUrl('https://proxy.com/v1beta').forAiSdk() // 'https://proxy.com/v1beta'
 * ```
 */
export function normalizeGoogleUrl(input: string): ProviderUrlNormalizationResult {
  return normalizeProviderUrl(input, "google");
}
