import { createClient } from "@cmux/www-openapi-client/client";
import { getApiEnvironments } from "@cmux/www-openapi-client";
import type { CliConfig } from "./config";
import type { StackAuthTokens } from "./stack-auth";

export type EnvironmentSummary = {
  id: string;
  name: string;
  description?: string;
  morphSnapshotId: string;
  updatedAt: number;
  createdAt: number;
};

export type FetchEnvironmentsOptions = Pick<CliConfig, "apiBaseUrl" | "teamSlugOrId" | "projectId"> & {
  tokens: StackAuthTokens;
};

export const fetchEnvironments = async (
  options: FetchEnvironmentsOptions,
): Promise<EnvironmentSummary[]> => {
  const { apiBaseUrl, teamSlugOrId, projectId, tokens } = options;
  const stackAuthHeader = JSON.stringify({
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
  });

  const fetchWithAuth: typeof fetch = Object.assign(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers ?? {});
      headers.set("x-stack-auth", stackAuthHeader);
      headers.set("x-stack-project-id", projectId);
      return fetch(input, {
        ...init,
        headers,
      });
    }) as typeof fetch,
    { preconnect: async () => {} },
  );

  const client = createClient({
    baseUrl: apiBaseUrl,
    fetch: fetchWithAuth,
  });

  const response = await getApiEnvironments({
    client,
    query: { teamSlugOrId },
  });

  if (!response.response.ok) {
    throw new Error(
      `Failed to load environments: HTTP ${response.response.status}`,
    );
  }

  const data = response.data;
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((environment) => ({
    id: environment.id,
    name: environment.name,
    description: environment.description,
    morphSnapshotId: environment.morphSnapshotId,
    updatedAt: environment.updatedAt,
    createdAt: environment.createdAt,
  }));
};

