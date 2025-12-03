import { log } from "../logger";

/**
 * Resolves the base URL for Convex HTTP actions.
 *
 * For Convex Cloud: transforms `.convex.cloud` → `.convex.site`
 * For self-hosted Convex: uses CONVEX_SITE_URL directly (different port for HTTP actions)
 *
 * Priority:
 * 1. CONVEX_SITE_URL (explicit HTTP action URL - used as-is for self-hosted)
 * 2. Override URL with .convex.cloud → .convex.site transformation
 */
function getConvexBaseUrl(override?: string): string | null {
  // If CONVEX_SITE_URL is explicitly set, use it directly
  // This is the primary way to configure self-hosted Convex HTTP action URLs
  const explicitSiteUrl = process.env.CONVEX_SITE_URL;
  if (explicitSiteUrl) {
    return explicitSiteUrl.replace(/\/$/, "");
  }

  const url = override;
  if (!url) {
    log("ERROR", "Convex URL is not configured; cannot call crown endpoints");
    return null;
  }

  // For Convex Cloud URLs, transform .convex.cloud → .convex.site
  const httpActionUrl = url.replace(".convex.cloud", ".convex.site");
  return httpActionUrl.replace(/\/$/, "");
}

export async function convexRequest<T>(
  path: string,
  token: string,
  body: Record<string, unknown>,
  baseUrlOverride?: string,
): Promise<T | null> {
  const baseUrl = getConvexBaseUrl(baseUrlOverride);
  if (!baseUrl) return null;

  const fullUrl = `${baseUrl}${path}`;

  try {
    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cmux-token": token,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "<no body>");
      log("ERROR", `Crown request failed (${response.status})`, {
        url: fullUrl,
        path,
        body,
        errorText,
      });
      return null;
    }

    return (await response.json()) as T;
  } catch (error) {
    log("ERROR", "Failed to reach crown endpoint", {
      url: fullUrl,
      path,
      error,
    });
    return null;
  }
}
