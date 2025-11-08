export type SearchParamsRecord =
  | Record<string, string | string[] | undefined>
  | null
  | undefined;

const FALSEY_FLAG_VALUES = new Set(["0", "false", "no", "off"]);

/**
 * Returns true when a `?flag` style search param is present and not explicitly disabled.
 * Accepts common falsey values like 0/false/no/off, otherwise treats presence as enabled.
 */
export function isSearchParamFlagEnabled(
  params: SearchParamsRecord,
  key: string
): boolean {
  if (!params) {
    return false;
  }

  const raw = params[key];
  if (typeof raw === "undefined") {
    return false;
  }

  if (Array.isArray(raw)) {
    if (raw.length === 0) {
      return true;
    }
    return raw.some((value) => interpretFlagValue(value));
  }

  return interpretFlagValue(raw);
}

function interpretFlagValue(value: string | undefined | null): boolean {
  if (typeof value !== "string") {
    return true;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized.length === 0) {
    return true;
  }

  if (FALSEY_FLAG_VALUES.has(normalized)) {
    return false;
  }

  return true;
}
