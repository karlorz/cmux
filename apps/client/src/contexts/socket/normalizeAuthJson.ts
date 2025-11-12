import type { AuthJson } from "../convex/authJsonQueryOptions";

interface NormalizedAuthState {
  authToken?: string;
  authJson?: Exclude<AuthJson, null>;
  serializedAuthJson?: string;
}

function pickLatestToken(
  authJson: Exclude<AuthJson, null>
): string | undefined {
  const refreshed = authJson.refreshedAccessToken;
  if (typeof refreshed === "string" && refreshed.length > 0) {
    return refreshed;
  }

  const accessToken = authJson.accessToken;
  if (typeof accessToken === "string" && accessToken.length > 0) {
    return accessToken;
  }

  return undefined;
}

export function normalizeAuthJson(
  authJson: AuthJson | undefined | null
): NormalizedAuthState {
  if (!authJson) {
    return {};
  }

  const latestToken = pickLatestToken(authJson);
  if (!latestToken) {
    return {};
  }

  const normalized =
    authJson.refreshedAccessToken &&
    authJson.refreshedAccessToken !== authJson.accessToken
      ? { ...authJson, accessToken: authJson.refreshedAccessToken }
      : authJson;

  return {
    authToken: latestToken,
    authJson: normalized,
    serializedAuthJson: JSON.stringify(normalized),
  };
}
