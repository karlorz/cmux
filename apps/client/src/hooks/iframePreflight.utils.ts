import { extractMorphInstanceInfo, isLoopbackHostname, parseProxyHostname } from "@cmux/shared";

export function shouldUseIframePreflightProxy(
  target: string | URL | null | undefined
): boolean {
  if (!target) {
    return false;
  }

  try {
    // Check for Morph instances
    if (extractMorphInstanceInfo(target) !== null) {
      return true;
    }

    // Check for PVE-LXC instances (port-{port}-pvelxc-{id}.{domain})
    const url = typeof target === "string" ? new URL(target) : target;
    const parsed = parseProxyHostname(url.hostname);
    if (parsed && parsed.hostId.startsWith("pvelxc-")) {
      return true;
    }

    return false;
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
