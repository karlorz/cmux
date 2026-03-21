export function isAllowedBaseUrl(urlString: string): {
  allowed: boolean;
  reason?: string;
} {
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { allowed: false, reason: "Invalid URL format" };
  }

  if (url.protocol !== "https:") {
    return { allowed: false, reason: "Only HTTPS URLs are allowed" };
  }

  const hostname = url.hostname.toLowerCase();

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  ) {
    return { allowed: false, reason: "Localhost URLs are not allowed" };
  }

  if (
    hostname === "169.254.169.254" ||
    hostname === "metadata.google.internal"
  ) {
    return { allowed: false, reason: "Metadata endpoints are not allowed" };
  }

  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4Match) {
    const octets = ipv4Match.slice(1).map(Number);
    const [first, second] = octets;

    if (first === 10) {
      return { allowed: false, reason: "Private IP ranges are not allowed" };
    }
    if (first === 172 && second >= 16 && second <= 31) {
      return { allowed: false, reason: "Private IP ranges are not allowed" };
    }
    if (first === 192 && second === 168) {
      return { allowed: false, reason: "Private IP ranges are not allowed" };
    }
    if (first === 169 && second === 254) {
      return { allowed: false, reason: "Link-local addresses are not allowed" };
    }
    if (first === 127) {
      return { allowed: false, reason: "Loopback addresses are not allowed" };
    }
  }

  const ipv6Match = hostname.match(/^\[([^\]]+)\]$/);
  if (ipv6Match) {
    const ipv6 = ipv6Match[1].toLowerCase();

    if (ipv6 === "::1") {
      return { allowed: false, reason: "Loopback addresses are not allowed" };
    }
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) {
      return {
        allowed: false,
        reason: "Private IPv6 addresses are not allowed",
      };
    }
    if (
      ipv6.startsWith("fe8") ||
      ipv6.startsWith("fe9") ||
      ipv6.startsWith("fea") ||
      ipv6.startsWith("feb")
    ) {
      return {
        allowed: false,
        reason: "Link-local IPv6 addresses are not allowed",
      };
    }
    if (ipv6 === "::") {
      return { allowed: false, reason: "Unspecified address is not allowed" };
    }
    if (ipv6.startsWith("::ffff:")) {
      return {
        allowed: false,
        reason: "IPv4-mapped IPv6 addresses are not allowed",
      };
    }
  }

  return { allowed: true };
}
