import { normalizeOrigin } from "@cmux/shared";
import { env } from "@/client-env";
import { deriveProxyServiceUrl } from "./deriveProxyServiceUrl";

/**
 * WWW_ORIGIN is the base URL for the www backend API.
 *
 * In development: Uses deriveProxyServiceUrl to handle both direct access
 * and proxied access (e.g., through Cloudflare Tunnel).
 *
 * In production: Uses NEXT_PUBLIC_WWW_ORIGIN from environment.
 */
export const WWW_ORIGIN = normalizeOrigin(
  deriveProxyServiceUrl(9779, env.NEXT_PUBLIC_WWW_ORIGIN),
);
