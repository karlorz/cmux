import { getGitHubTokenFromKeychain } from "./getGitHubToken.js";
import { getOctokit } from "./octokit.js";
import { serverLogger } from "./fileLogger.js";

export interface ValidatedRepoInfo {
  fullName: string;
  org: string;
  name: string;
  defaultBranch: string;
  visibility: "public" | "private";
  ownerLogin: string;
  ownerType: "User" | "Organization";
}

/**
 * Validates that a GitHub repository exists and is accessible.
 * Returns repository metadata if successful, throws an error otherwise.
 */
export async function validateGithubRepo(
  projectFullName: string
): Promise<ValidatedRepoInfo> {
  const [owner, repo] = projectFullName.split("/");

  if (!owner || !repo) {
    throw new Error(`Invalid repository name format: ${projectFullName}`);
  }

  try {
    const githubToken = await getGitHubTokenFromKeychain();
    if (!githubToken) {
      throw new Error("GitHub token is not configured");
    }

    const octokit = getOctokit(githubToken);

    serverLogger.info(`Validating GitHub repo: ${projectFullName}`);

    // Attempt to fetch repository info
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo,
    });

    serverLogger.info(`Successfully validated repo ${projectFullName}: ${repoData.visibility}`);

    // Only allow public repositories
    if (repoData.visibility === "private") {
      throw new Error(
        `Repository ${projectFullName} is private. ` +
        `Only public repositories can be added via links. ` +
        `Use the GitHub App integration to add private repositories.`
      );
    }

    return {
      fullName: repoData.full_name,
      org: repoData.owner.login,
      name: repoData.name,
      defaultBranch: repoData.default_branch,
      visibility: "public",
      ownerLogin: repoData.owner.login,
      ownerType: repoData.owner.type === "Organization" ? "Organization" : "User",
    };
  } catch (error: unknown) {
    if (error && typeof error === "object" && "status" in error) {
      const status = (error as { status: number }).status;

      if (status === 404) {
        throw new Error(
          `Repository ${projectFullName} not found or not accessible. ` +
          `Make sure the repository is public or you have access to it.`
        );
      } else if (status === 401 || status === 403) {
        throw new Error(
          `Access denied to ${projectFullName}. ` +
          `Please check your GitHub authentication and repository permissions.`
        );
      }
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to validate repository ${projectFullName}: ${message}`);
  }
}
