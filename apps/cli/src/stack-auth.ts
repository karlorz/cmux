import type { CliConfig } from "./config";

export interface StackAuthClientOptions {
  baseUrl: string;
  projectId: string;
  publishableClientKey: string;
}

export interface PromptCliLoginOptions extends StackAuthClientOptions {
  appUrl: string;
  onStatus?: (message: string) => void;
}

export interface StackUser {
  id?: string;
  primary_email?: string | null;
  display_name?: string | null;
}

export interface StackAuthTokens {
  refreshToken: string;
  accessToken: string;
}

class StackAuthError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "StackAuthError";
    this.status = status;
    this.body = body;
  }
}

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const joinUrl = (baseUrl: string, endpoint: string): string => {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  return `${normalizedBase}${normalizedEndpoint}`;
};

const defaultHeaders = (options: StackAuthClientOptions): HeadersInit => ({
  "Content-Type": "application/json",
  "x-stack-project-id": options.projectId,
  "x-stack-access-type": "client",
  "x-stack-publishable-client-key": options.publishableClientKey,
});

const stackAuthRequest = async <T>(
  options: StackAuthClientOptions,
  method: "get" | "post" | "patch" | "delete",
  endpoint: string,
  body?: unknown,
  additionalHeaders?: HeadersInit,
): Promise<T> => {
  const headers = new Headers(defaultHeaders(options));
  if (additionalHeaders) {
    const extra = additionalHeaders instanceof Headers
      ? additionalHeaders
      : new Headers(additionalHeaders);
    extra.forEach((value, key) => headers.set(key, value));
  }

  const response = await fetch(joinUrl(options.baseUrl, endpoint), {
    method: method.toUpperCase(),
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const rawText = await response.text();
  let parsed: unknown = undefined;
  if (rawText.length > 0) {
    try {
      parsed = JSON.parse(rawText) as unknown;
    } catch (_error) {
      parsed = rawText;
    }
  }

  if (!response.ok) {
    throw new StackAuthError(
      `Stack Auth request failed with ${response.status}`,
      response.status,
      parsed,
    );
  }

  return parsed as T;
};

const tryOpenBrowser = async (url: string): Promise<boolean> => {
  try {
    const mod = await import("open");
    const open = mod.default;
    await open(url, { wait: false });
    return true;
  } catch (_error) {
    return false;
  }
};

export const promptCliLogin = async (
  options: PromptCliLoginOptions,
): Promise<StackAuthTokens> => {
  const log = (message: string): void => {
    options.onStatus?.(message);
  };

  const initResponse = await stackAuthRequest<{
    polling_code: string;
    login_code: string;
  }>(options, "post", "/api/v1/auth/cli", { expires_in_millis: 10 * 60 * 1000 });

  const loginUrl = joinUrl(options.appUrl, "/handler/cli-auth-confirm");
  const urlWithCode = `${loginUrl}?login_code=${encodeURIComponent(initResponse.login_code)}`;

  log("Opening browser for Stack Auth login...");
  const opened = await tryOpenBrowser(urlWithCode);
  if (!opened) {
    log("Unable to open browser automatically. Please manually visit the URL below:");
  }
  log(urlWithCode);

  const start = Date.now();
  const expiresAt = start + 10 * 60 * 1000;
  log("Waiting for login confirmation...");

  while (true) {
    if (Date.now() > expiresAt) {
      throw new Error("CLI login expired before completion.");
    }

    const pollResponse = await stackAuthRequest<{
      status: "pending" | "success" | "expired" | string;
      refresh_token?: string;
    }>(options, "post", "/api/v1/auth/cli/poll", {
      polling_code: initResponse.polling_code,
    });

    if (pollResponse.status === "pending") {
      await sleep(2000);
      continue;
    }

    if (pollResponse.status === "expired") {
      throw new Error("CLI login expired. Please try again.");
    }

    if (pollResponse.status === "success") {
      const refreshToken = pollResponse.refresh_token;
      if (!refreshToken) {
        throw new Error("Stack Auth did not return a refresh token.");
      }
      const accessTokenResponse = await getAccessToken(options, refreshToken);
      return {
        refreshToken,
        accessToken: accessTokenResponse,
      };
    }

    throw new Error(`Unexpected Stack Auth poll status: ${pollResponse.status}`);
  }
};

export const getAccessToken = async (
  options: StackAuthClientOptions,
  refreshToken: string,
): Promise<string> => {
  const response = await stackAuthRequest<{
    access_token: string;
  }>(
    options,
    "post",
    "/api/v1/auth/sessions/current/refresh",
    undefined,
    { "x-stack-refresh-token": refreshToken },
  );

  const accessToken = response.access_token;
  if (!accessToken) {
    throw new Error("Stack Auth did not return an access token.");
  }
  return accessToken;
};

export const fetchCurrentUser = async (
  options: StackAuthClientOptions,
  accessToken: string,
): Promise<StackUser> => {
  const user = await stackAuthRequest<StackUser>(
    options,
    "get",
    "/api/v1/users/me",
    undefined,
    { "x-stack-access-token": accessToken },
  );
  return user;
};

export const authenticateUser = async (
  config: CliConfig,
  onStatus?: (message: string) => void,
): Promise<{ user: StackUser; tokens: StackAuthTokens }> => {
  const authOptions: StackAuthClientOptions = {
    baseUrl: config.stackAuthBaseUrl,
    projectId: config.projectId,
    publishableClientKey: config.publishableClientKey,
  };
  const result = await promptCliLogin({
    appUrl: config.appUrl,
    onStatus,
    ...authOptions,
  });
  const user = await fetchCurrentUser(authOptions, result.accessToken);
  return { user, tokens: result };
};

