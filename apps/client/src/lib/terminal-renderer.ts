import { env } from "@/client-env";

export type TerminalRenderer = "xterm" | "ghostty";

export function resolveTerminalRenderer(
  configuredRenderer?: string | null
): TerminalRenderer {
  return configuredRenderer === "ghostty" ? "ghostty" : "xterm";
}

/**
 * Get the terminal renderer to use.
 * Priority: URL query param (?renderer=ghostty) > env var > default (xterm)
 */
export function getTerminalRenderer(): TerminalRenderer {
  // Check URL query param first (allows easy testing without restart)
  if (typeof window !== "undefined") {
    const params = new URLSearchParams(window.location.search);
    const queryRenderer = params.get("renderer");
    if (queryRenderer === "ghostty" || queryRenderer === "xterm") {
      return queryRenderer;
    }
  }
  return resolveTerminalRenderer(env.NEXT_PUBLIC_TERMINAL_RENDERER);
}
