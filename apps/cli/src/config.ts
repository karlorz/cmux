export type CliConfig = {
  stackAuthBaseUrl: string;
  appUrl: string;
  apiBaseUrl: string;
  projectId: string;
  publishableClientKey: string;
  teamSlugOrId: string;
};

const DEFAULT_STACK_AUTH_BASE_URL = "https://api.stack-auth.com";
const DEFAULT_APP_URL = "https://www.cmux.sh";
const DEFAULT_API_BASE_URL = "https://www.cmux.sh";

const envFallbacks: Record<keyof CliConfig, readonly string[]> = {
  stackAuthBaseUrl: ["STACK_AUTH_BASE_URL"],
  appUrl: ["STACK_APP_URL", "NEXT_PUBLIC_CMUX_APP_URL", "CMUX_APP_URL"],
  apiBaseUrl: ["CMUX_API_BASE_URL", "NEXT_PUBLIC_WWW_ORIGIN"],
  projectId: ["NEXT_PUBLIC_STACK_PROJECT_ID", "STACK_PROJECT_ID"],
  publishableClientKey: [
    "NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY",
    "STACK_PUBLISHABLE_CLIENT_KEY",
  ],
  teamSlugOrId: ["CMUX_TEAM_SLUG", "CMUX_TEAM_ID", "STACK_TEAM"],
};

const defaults: CliConfig = {
  stackAuthBaseUrl: DEFAULT_STACK_AUTH_BASE_URL,
  appUrl: DEFAULT_APP_URL,
  apiBaseUrl: DEFAULT_API_BASE_URL,
  projectId: "",
  publishableClientKey: "",
  teamSlugOrId: "",
};

const readEnv = (keys: readonly string[]): string | undefined => {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
};

export const loadInitialConfig = (): CliConfig => {
  const result: CliConfig = { ...defaults };
  (Object.keys(envFallbacks) as Array<keyof CliConfig>).forEach((key) => {
    const fromEnv = readEnv(envFallbacks[key]);
    if (fromEnv) {
      result[key] = fromEnv;
    }
  });
  return result;
};

export const sanitizeBaseUrl = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return trimmed.replace(/\/$/, "");
  }
};

export const sanitizeAppUrl = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }
  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/$/, "");
  } catch (_error) {
    return trimmed.replace(/\/$/, "");
  }
};

