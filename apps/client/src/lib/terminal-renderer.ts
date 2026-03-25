import { env } from "@/client-env";

export type TerminalRenderer = "xterm" | "ghostty";

export function resolveTerminalRenderer(
  configuredRenderer?: string | null
): TerminalRenderer {
  return configuredRenderer === "ghostty" ? "ghostty" : "xterm";
}

export function getTerminalRenderer(): TerminalRenderer {
  return resolveTerminalRenderer(env.NEXT_PUBLIC_TERMINAL_RENDERER);
}
