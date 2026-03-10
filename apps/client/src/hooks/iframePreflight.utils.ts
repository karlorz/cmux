import { extractMorphInstanceInfo, isLoopbackHostname } from "@cmux/shared";

export function shouldUseIframePreflightProxy(
  target: string | URL | null | undefined
): boolean {
  if (!target) {
    return false;
  }

  try {
    return extractMorphInstanceInfo(target) !== null;
  } catch {
    return false;
  }
}

export function shouldUseServerIframePreflight(
  target: string | URL | null | undefined
): boolean {
  if (!target) {
    return false;
  }

  try {
    const url = typeof target === "string" ? new URL(target) : target;
    return isLoopbackHostname(url.hostname);
  } catch {
    return false;
  }
}
