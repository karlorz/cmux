const GITHUB_REPO_API_URL =
  "https://api.github.com/repos/manaflow-ai/cmux";

type GithubRepoResponse = {
  stargazers_count?: number;
};

export type GithubRepoStats = {
  stars: number | null;
};

export async function fetchGithubRepoStats(): Promise<GithubRepoStats> {
  try {
    const response = await fetch(GITHUB_REPO_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: {
        // Refresh at most every 30 minutes to keep a reasonably fresh star count.
        revalidate: 1800,
      },
    });

    if (!response.ok) {
      return { stars: null };
    }

    const data = (await response.json()) as GithubRepoResponse;

    return {
      stars:
        typeof data.stargazers_count === "number"
          ? data.stargazers_count
          : null,
    };
  } catch (error) {
    console.error("Failed to fetch cmux GitHub repository stats", error);
    return { stars: null };
  }
}
