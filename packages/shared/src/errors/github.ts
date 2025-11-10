export const GITHUB_CONNECTION_REQUIRED_ERROR_CODE =
  "github_connection_required";
export const GITHUB_CONNECTION_REQUIRED_ERROR_TOKEN =
  "[github_connection_required]";
export const DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE =
  "Connect GitHub to cmux so we can access your repositories for cloud workspaces.";

export type GithubConnectionRequiredErrorPayload = {
  code: typeof GITHUB_CONNECTION_REQUIRED_ERROR_CODE;
  message: string;
  requiresGithubConnection: true;
};

export const createGithubConnectionRequiredPayload = (
  message: string = DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE,
): GithubConnectionRequiredErrorPayload => ({
  code: GITHUB_CONNECTION_REQUIRED_ERROR_CODE,
  message,
  requiresGithubConnection: true,
});

export const formatGithubConnectionRequiredErrorMessage = (
  message: string = DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE,
) =>
  `${GITHUB_CONNECTION_REQUIRED_ERROR_TOKEN} ${
    message || DEFAULT_GITHUB_CONNECTION_REQUIRED_MESSAGE
  }`;

export class GithubConnectionRequiredError extends Error {
  code = GITHUB_CONNECTION_REQUIRED_ERROR_CODE;
  requiresGithubConnection = true;

  constructor(message: string = DEFAULT_GITHUB_CONNECTION_REQUIRED_ERROR_MESSAGE) {
    super(formatGithubConnectionRequiredErrorMessage(message));
    this.name = "GithubConnectionRequiredError";
  }
}

export const isGithubConnectionRequiredPayload = (
  value: unknown,
): value is GithubConnectionRequiredErrorPayload => {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    (value as { code?: string }).code ===
      GITHUB_CONNECTION_REQUIRED_ERROR_CODE
  );
};

export const isGithubConnectionRequiredMessage = (
  value: string | null | undefined,
) =>
  typeof value === "string" &&
  value.includes(GITHUB_CONNECTION_REQUIRED_ERROR_TOKEN);
