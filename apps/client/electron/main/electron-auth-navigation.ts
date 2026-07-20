/**
 * Pure helpers for Electron main-window auth navigation.
 *
 * Problem: Stack/GitHub OAuth navigates the main BrowserWindow away from the
 * SPA, and Electron hash history never sees path-style /handler/* callbacks.
 *
 * Decisions (main window):
 * - SPA origins: allow
 * - /handler/* on SPA origin: rewrite to #/handler/* (hash router)
 * - OAuth providers: open dedicated auth window (shared partition)
 * - other http(s): open external browser; keep main on SPA
 */

export type AuthNavDecision =
  | { action: "allow" }
  | { action: "rewrite-hash"; url: string }
  | { action: "auth-window"; url: string }
  | { action: "external"; url: string };

export type ClassifyMainWindowNavigationOptions = {
  /** Origins considered the cmux SPA (e.g. http://localhost:5173, https://cmux.local) */
  spaOrigins: readonly string[];
};

const OAUTH_HOST_SUFFIXES = [
  "stack-auth.com",
  "github.com",
  "githubusercontent.com",
  "google.com",
  "accounts.google.com",
  "login.microsoftonline.com",
] as const;

function normalizeOrigin(origin: string): string {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/$/, "");
  }
}

export function isSpaOrigin(
  rawUrl: string,
  spaOrigins: readonly string[]
): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  const origin = url.origin;
  return spaOrigins.some((candidate) => normalizeOrigin(candidate) === origin);
}

export function isOAuthProviderUrl(rawUrl: string): boolean {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return OAUTH_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`)
  );
}

/**
 * Convert path-style Stack handler URLs to hash-router form.
 * http://localhost:5173/handler/oauth-callback?x=1
 *   → http://localhost:5173/#/handler/oauth-callback?x=1
 *
 * Query string is kept on the hash path so TanStack hash history + StackHandler
 * receive the OAuth code (location.pathname + location.search).
 *
 * Returns null when no rewrite is needed.
 */
export function rewriteHandlerPathToHash(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  // Already hash-routed (optionally normalize query-on-search → query-in-hash)
  if (url.hash.startsWith("#/handler")) {
    // e.g. http://host/#/handler/x with ?code= on the outer search is unusual;
    // leave as-is if already hash-only.
    if (!url.search) {
      return null;
    }
    // Rare: path empty, search on origin, hash has path — merge search into hash
    const hashBody = url.hash.slice(1); // drop leading #
    if (hashBody.includes("?")) {
      return null;
    }
    const rewritten = new URL(url.origin);
    rewritten.hash = `${hashBody}${url.search}`;
    return rewritten.toString();
  }

  if (!url.pathname.startsWith("/handler")) {
    return null;
  }

  const rewritten = new URL(url.origin);
  // URL.hash setter prefixes "#"; pathname already starts with "/"
  rewritten.hash = `${url.pathname}${url.search}`;
  return rewritten.toString();
}

/**
 * Shared SPA / non-http classification.
 * Returns a decision when the URL is non-http, invalid, or SPA; otherwise null.
 */
function classifySpaNavigation(
  rawUrl: string,
  spaOrigins: readonly string[]
): AuthNavDecision | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { action: "allow" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { action: "allow" };
  }

  if (!isSpaOrigin(rawUrl, spaOrigins)) {
    return null;
  }

  const rewritten = rewriteHandlerPathToHash(rawUrl);
  if (rewritten) {
    return { action: "rewrite-hash", url: rewritten };
  }
  return { action: "allow" };
}

/**
 * Classify a main-frame navigation for the app window.
 * Non-http(s) schemes (devtools, about, file, chrome-error) are allowed.
 */
export function classifyMainWindowNavigation(
  rawUrl: string,
  options: ClassifyMainWindowNavigationOptions
): AuthNavDecision {
  const spaDecision = classifySpaNavigation(rawUrl, options.spaOrigins);
  if (spaDecision) {
    return spaDecision;
  }

  if (isOAuthProviderUrl(rawUrl)) {
    return { action: "auth-window", url: rawUrl };
  }

  return { action: "external", url: rawUrl };
}

/**
 * Auth child window: allow OAuth + SPA; rewrite path handler; otherwise external.
 * Callers close the auth window when SPA callback is reached.
 */
export function classifyAuthWindowNavigation(
  rawUrl: string,
  options: ClassifyMainWindowNavigationOptions
): AuthNavDecision {
  const spaDecision = classifySpaNavigation(rawUrl, options.spaOrigins);
  if (spaDecision) {
    return spaDecision;
  }

  if (isOAuthProviderUrl(rawUrl)) {
    return { action: "allow" };
  }

  return { action: "external", url: rawUrl };
}

/** True when URL is a Stack/handler callback on the SPA (path or hash). */
export function isSpaAuthCallback(
  rawUrl: string,
  spaOrigins: readonly string[]
): boolean {
  if (!isSpaOrigin(rawUrl, spaOrigins)) {
    return false;
  }
  try {
    const url = new URL(rawUrl);
    return (
      url.pathname.startsWith("/handler") || url.hash.startsWith("#/handler")
    );
  } catch {
    return false;
  }
}

export function buildSpaOrigins(params: {
  appHost: string;
  electronRendererUrl?: string | null;
  extraOrigins?: readonly string[];
}): string[] {
  const origins = new Set<string>();
  origins.add(`https://${params.appHost}`);
  origins.add(`http://${params.appHost}`);
  origins.add("http://localhost:5173");
  origins.add("http://127.0.0.1:5173");

  if (params.electronRendererUrl) {
    try {
      origins.add(new URL(params.electronRendererUrl).origin);
    } catch {
      // ignore
    }
  }

  for (const extra of params.extraOrigins ?? []) {
    try {
      origins.add(new URL(extra).origin);
    } catch {
      // ignore
    }
  }

  return [...origins];
}
