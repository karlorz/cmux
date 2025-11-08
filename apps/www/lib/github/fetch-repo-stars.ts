import { createGitHubClient } from "./octokit";

export async function fetchRepoStars(
  owner: string,
  repo: string
): Promise<number | null> {
  try {
    const octokit = createGitHubClient(null);
    const { data } = await octokit.rest.repos.get({
      owner,
      repo,
    });
    return data.stargazers_count;
  } catch (error) {
    console.error("Failed to fetch GitHub star count:", error);
    return null;
  }
}
