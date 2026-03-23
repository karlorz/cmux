import { normalizeOrigin } from "@cmux/shared";

export function getConfiguredOrigins(
  candidates: Iterable<string | null | undefined>,
): string[] {
  const origins = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }

    for (const rawPart of candidate.split(",")) {
      const normalized = normalizeOrigin(rawPart.trim());
      if (normalized) {
        origins.add(normalized);
      }
    }
  }

  return [...origins];
}

export function getConfiguredOriginHostnames(
  candidates: Iterable<string | null | undefined>,
): string[] {
  const hostnames = new Set<string>();

  for (const origin of getConfiguredOrigins(candidates)) {
    try {
      hostnames.add(new URL(origin).hostname.toLowerCase());
    } catch {
      // Ignore malformed configured origins rather than widening the allowlist.
    }
  }

  return [...hostnames];
}
