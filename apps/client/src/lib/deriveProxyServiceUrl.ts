import { isLoopbackHostname } from "@cmux/shared";

const PROXY_HOST_REGEX = /^port-(\d+)-([^.]+)\.(.+)$/;

interface ProxyHostnameComponents {
  currentPort: number;
  hostId: string;
  domain: string;
}

export function parseProxyHostname(
  hostname: string,
): ProxyHostnameComponents | null {
  const match = hostname.match(PROXY_HOST_REGEX);
  if (!match) {
    return null;
  }

  const [, portStr, hostId, domain] = match;
  const currentPort = Number.parseInt(portStr, 10);
  if (Number.isNaN(currentPort)) {
    return null;
  }

  return { currentPort, hostId, domain };
}

export function buildProxyOrigin(
  components: { hostId: string; domain: string },
  targetPort: number,
): string {
  return `https://port-${targetPort}-${components.hostId}.${components.domain}`;
}

export function deriveProxyServiceUrl(
  targetPort: number,
  fallbackUrl: string,
): string {
  if (typeof window === "undefined") {
    return fallbackUrl;
  }

  // Only derive proxy URL if fallback points to localhost.
  try {
    const parsed = new URL(fallbackUrl);
    if (!isLoopbackHostname(parsed.hostname)) {
      return fallbackUrl;
    }
  } catch {
    // If fallback is not parseable, still allow proxy derivation by hostname.
  }

  const components = parseProxyHostname(window.location.hostname);
  if (!components) {
    return fallbackUrl;
  }

  return buildProxyOrigin(components, targetPort);
}
