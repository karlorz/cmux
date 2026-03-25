import { env } from "@/client-env";

export type TerminalRenderer = "xterm" | "ghostty";

export function resolveTerminalRenderer(
  configuredRenderer?: string | null
): TerminalRenderer {
  return configuredRenderer === "ghostty" ? "ghostty" : "xterm";
}

// Cache the renderer choice since it won't change during the session
let cachedRenderer: TerminalRenderer | null = null;

/**
 * Get the terminal renderer to use.
 * Priority: URL query param (?renderer=ghostty) > env var > default (xterm)
 * Result is cached for the session lifetime.
 */
export function getTerminalRenderer(): TerminalRenderer {
  if (cachedRenderer !== null) {
    return cachedRenderer;
  }

  // Check URL query param first (allows easy testing without restart)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const queryRenderer = params.get("renderer");
    if (queryRenderer === "ghostty" || queryRenderer === "xterm") {
      cachedRenderer = queryRenderer;
      return cachedRenderer;
    }
  }

  cachedRenderer = resolveTerminalRenderer(env.NEXT_PUBLIC_TERMINAL_RENDERER);
  return cachedRenderer;
}
