import { decodeJwt } from "jose";
import { z } from "zod";

export const CODEX_OAUTH_TOKEN_ENDPOINT = "https://auth.openai.com/oauth/token";

// Discovered from ~/.codex/auth.json id_token "aud" claim (OAuth client_id).
export const CODEX_OAUTH_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

const ExpiresAtSchema = z
  .union([z.number(), z.string()])
  .optional()
  .transform((value): number | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === "number") return normalizeEpochMs(value);

    const parsedNumber = Number(value);
    if (Number.isFinite(parsedNumber)) {
      return normalizeEpochMs(parsedNumber);
    }

    const parsedDate = Date.parse(value);
    if (!Number.isNaN(parsedDate)) {
      return parsedDate;
    }

    return undefined;
  });

/**
 * Normalized token shape extracted from ~/.codex/auth.json (or CODEX_AUTH_JSON).
 */
export const CodexAuthJsonSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  id_token: z.string().min(1).optional(),
  expires_at: ExpiresAtSchema,
  account_id: z.string().min(1).optional(),
  email: z.string().min(1).optional(),
});

export type CodexAuthJson = z.infer<typeof CodexAuthJsonSchema>;

const CodexAuthJsonFileSchema = z
  .object({
    // Some versions store tokens at the top level
    access_token: z.string().optional(),
    refresh_token: z.string().optional(),
    id_token: z.string().optional(),
    expires_at: z.union([z.number(), z.string()]).optional(),
    account_id: z.string().optional(),
    email: z.string().optional(),
    // Current Codex CLI stores tokens under "tokens"
    tokens: z
      .object({
        access_token: z.string().optional(),
        refresh_token: z.string().optional(),
        id_token: z.string().optional(),
        expires_at: z.union([z.number(), z.string()]).optional(),
        account_id: z.string().optional(),
        email: z.string().optional(),
      })
      .optional(),
  })
  .passthrough();

export function parseCodexAuthJson(raw: string): CodexAuthJson | null {
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(raw);
  } catch {
    return null;
  }

  const parsedFile = CodexAuthJsonFileSchema.safeParse(parsedUnknown);
  if (!parsedFile.success) return null;

  const tokenCandidate = parsedFile.data.tokens ?? parsedFile.data;
  const normalizedCandidate = {
    access_token: tokenCandidate.access_token,
    refresh_token: tokenCandidate.refresh_token,
    id_token: tokenCandidate.id_token,
    expires_at: tokenCandidate.expires_at,
    account_id: tokenCandidate.account_id,
    email: tokenCandidate.email,
  };

  const normalized = CodexAuthJsonSchema.safeParse(normalizedCandidate);
  if (!normalized.success) return null;

  return normalized.data;
}

export function getCodexTokenExpiresAtMs(auth: CodexAuthJson): number | null {
  if (typeof auth.expires_at === "number" && Number.isFinite(auth.expires_at)) {
    return normalizeEpochMs(auth.expires_at);
  }

  try {
    const decoded = decodeJwt(auth.access_token);
    if (typeof decoded.exp === "number") {
      return decoded.exp * 1000;
    }
  } catch {
    // ignore
  }

  return null;
}

export function isCodexTokenExpired(auth: CodexAuthJson): boolean {
  const expiresAtMs = getCodexTokenExpiresAtMs(auth);
  if (expiresAtMs === null) return false;
  return expiresAtMs <= Date.now();
}

export function isCodexTokenExpiring(
  auth: CodexAuthJson,
  leadTimeMs: number = 24 * 60 * 60 * 1000
): boolean {
  const expiresAtMs = getCodexTokenExpiresAtMs(auth);
  if (expiresAtMs === null) return false;
  return expiresAtMs <= Date.now() + leadTimeMs;
}

function normalizeEpochMs(value: number): number {
  // Heuristic: seconds are ~1e9..1e10, milliseconds are ~1e12..1e13.
  if (value < 1_000_000_000_000) {
    return value * 1000;
  }
  return value;
}

