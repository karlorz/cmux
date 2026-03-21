import { env } from "@/lib/utils/www-env";
import type { IframePreflightResult } from "@cmux/shared";

const ALLOWED_HOST_SUFFIXES = [
  ".cmux.sh",
  ".cmux.dev",
  ".manaflow.com",
  ".cmux.local",
  ".cmux.localhost",
  ".cmux.app",
  ".autobuild.app",
  ".http.cloud.morph.so",
  ".vm.freestyle.sh",
] as const;

const ALLOWED_EXACT_HOSTS = new Set<string>([
  "cmux.sh",
  "www.cmux.sh",
  "cmux.dev",
  "www.cmux.dev",
  "manaflow.com",
  "www.manaflow.com",
  "cmux.local",
  "cmux.localhost",
  "cmux.app",
]);

const DEV_ONLY_HOSTS = new Set<string>(["localhost", "127.0.0.1", "::1"]);

function getDynamicAllowedHostSuffixes(): string[] {
  const suffixes: string[] = [];
  if (env.PVE_PUBLIC_DOMAIN) {
    suffixes.push(`.${env.PVE_PUBLIC_DOMAIN}`);
  }
  return suffixes;
}

export function isAllowedHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();

  if (ALLOWED_EXACT_HOSTS.has(normalized)) {
    return true;
  }

  if (ALLOWED_HOST_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  const dynamicSuffixes = getDynamicAllowedHostSuffixes();
  if (dynamicSuffixes.some((suffix) => normalized.endsWith(suffix))) {
    return true;
  }

  const isDevelopment = process.env.NODE_ENV !== "production";
  if (isDevelopment && DEV_ONLY_HOSTS.has(normalized)) {
    return true;
  }

  return false;
}

export async function performPreflight(
  target: URL,
): Promise<IframePreflightResult> {
  const probe = async (method: "HEAD" | "GET") => {
    const response = await fetch(target, {
      method,
      redirect: "manual",
    });
    await response.body?.cancel().catch((error) => {
      console.error(
        "[iframe-preflight] Failed to cancel preflight response body:",
        error,
      );
      return undefined;
    });
    return response;
  };

  try {
    const headResponse = await probe("HEAD");

    if (headResponse.ok) {
      return {
        ok: true,
        status: headResponse.status,
        method: "HEAD",
      };
    }

    if (headResponse.status === 405) {
      const getResponse = await probe("GET");
      if (getResponse.ok) {
        return {
          ok: true,
          status: getResponse.status,
          method: "GET",
        };
      }

      return {
        ok: false,
        status: getResponse.status,
        method: "GET",
        error: `Request failed with status ${getResponse.status}.`,
      };
    }

    return {
      ok: false,
      status: headResponse.status,
      method: "HEAD",
      error: `Request failed with status ${headResponse.status}.`,
    };
  } catch (error) {
    console.error("[iframe-preflight] Preflight probe failed:", error);
    return {
      ok: false,
      status: null,
      method: null,
      error:
        error instanceof Error
          ? error.message
          : "Unknown error during preflight.",
    };
  }
}
