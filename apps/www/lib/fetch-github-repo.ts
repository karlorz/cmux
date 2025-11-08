import { GITHUB_REPO_API_URL, GITHUB_REPO_URL } from "@/lib/github/constants";

export type GithubRepoStats = {
  repoUrl: string;
  starCount: number | null;
};

type GithubRepoResponse = {
  stargazers_count?: number;
};

const FALLBACK_STATS: GithubRepoStats = {
  repoUrl: GITHUB_REPO_URL,
  starCount: null,
};

export async function fetchGithubRepoStats(): Promise<GithubRepoStats> {
  try {
    const response = await fetch(GITHUB_REPO_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: {
        revalidate: 3600,
      },
    });

    if (!response.ok) {
      return FALLBACK_STATS;
    }

    const data = (await response.json()) as GithubRepoResponse;
    const starCount =
      typeof data.stargazers_count === "number" ? data.stargazers_count : null;

    return {
      repoUrl: GITHUB_REPO_URL,
      starCount,
    };
  } catch (error) {
    console.error("Failed to retrieve GitHub repo stats", error);
    return FALLBACK_STATS;
  }
}
