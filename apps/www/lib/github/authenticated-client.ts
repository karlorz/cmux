import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";

const USER_AGENT = "cmux-www-pr-viewer";

interface GitHubClientOptions {
  installationId?: number;
  userToken?: string;
}

/**
 * Creates a GitHub client with appropriate authentication
 * Priority order:
 * 1. User-specific installation token (for private repos)
 * 2. GitHub App installation token
 * 3. Personal access token from environment
 * 4. Unauthenticated client
 */
export async function createAuthenticatedGitHubClient(
  options: GitHubClientOptions = {}
): Promise<Octokit> {
  const { installationId, userToken } = options;

  // If we have a user token, use it
  if (userToken) {
    return new Octokit({
      auth: userToken,
      userAgent: USER_AGENT,
      request: {
        timeout: 20_000,
      },
    });
  }

  // If we have GitHub App credentials and an installation ID, create an installation token
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (appId && privateKey && installationId) {
    try {
      const auth = createAppAuth({
        appId,
        privateKey,
        installationId,
      });

      const installationAuth = await auth({ type: "installation" });

      return new Octokit({
        auth: installationAuth.token,
        userAgent: USER_AGENT,
        request: {
          timeout: 20_000,
        },
      });
    } catch (error) {
      console.error("Failed to create GitHub App installation token:", error);
      // Fall through to use regular token if available
    }
  }

  // Fall back to personal access token from environment
  const authToken = process.env.GITHUB_TOKEN;

  return new Octokit({
    auth: authToken,
    userAgent: USER_AGENT,
    request: {
      timeout: 20_000,
    },
  });
}

/**
 * Check if a repository is accessible with current authentication
 */
export async function checkRepositoryAccess(
  owner: string,
  repo: string,
  options: GitHubClientOptions = {}
): Promise<{
  accessible: boolean;
  isPrivate: boolean;
  requiresAuth: boolean;
}> {
  try {
    const octokit = await createAuthenticatedGitHubClient(options);

    const { data: repository } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    return {
      accessible: true,
      isPrivate: repository.private,
      requiresAuth: false,
    };
  } catch (error: any) {
    if (error.status === 404) {
      // Could be private or non-existent
      return {
        accessible: false,
        isPrivate: true, // Assume private if we can't access
        requiresAuth: true,
      };
    }

    if (error.status === 403) {
      // Forbidden - likely rate limited or needs auth
      return {
        accessible: false,
        isPrivate: true,
        requiresAuth: true,
      };
    }

    // Other errors - assume not accessible
    return {
      accessible: false,
      isPrivate: false,
      requiresAuth: false,
    };
  }
}

/**
 * Get user's GitHub installations for cmux-agent
 */
export async function getUserInstallations(userToken: string): Promise<
  Array<{
    id: number;
    account: {
      login: string;
      type: string;
    };
    repositories: Array<{
      id: number;
      name: string;
      full_name: string;
      private: boolean;
    }>;
  }>
> {
  try {
    const octokit = new Octokit({
      auth: userToken,
      userAgent: USER_AGENT,
    });

    const { data: installations } = await octokit.request(
      "GET /user/installations",
      {
        per_page: 100,
      }
    );

    const installationsWithRepos = await Promise.all(
      installations.installations.map(async (installation) => {
        try {
          const { data: repoData } = await octokit.request(
            "GET /user/installations/{installation_id}/repositories",
            {
              installation_id: installation.id,
              per_page: 100,
            }
          );

          const account = installation.account;
          const login = account && 'login' in account ? account.login : (account && 'name' in account ? account.name : "");
          const type = account && 'type' in account ? account.type : "Organization";

          return {
            id: installation.id,
            account: {
              login: login || "",
              type: type || "",
            },
            repositories: repoData.repositories.map((repo: any) => ({
              id: repo.id,
              name: repo.name,
              full_name: repo.full_name,
              private: repo.private,
            })),
          };
        } catch (error) {
          console.error(`Failed to fetch repos for installation ${installation.id}:`, error);
          const account = installation.account;
          const login = account && 'login' in account ? account.login : (account && 'name' in account ? account.name : "");
          const type = account && 'type' in account ? account.type : "Organization";

          return {
            id: installation.id,
            account: {
              login: login || "",
              type: type || "",
            },
            repositories: [],
          };
        }
      })
    );

    return installationsWithRepos;
  } catch (error) {
    console.error("Failed to get user installations:", error);
    return [];
  }
}