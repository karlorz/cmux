import { unstable_cache } from "next/cache";

const GITHUB_REPO_API_URL = "https://api.github.com/repos/manaflow-ai/cmux";

type GithubRepoResponse = {
  stargazers_count?: number;
};

async function fetchGithubRepoStars(): Promise<number | null> {
  const response = await fetch(GITHUB_REPO_API_URL, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "cmux-www",
    },
    next: {
      revalidate: 3600,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GithubRepoResponse;
  const stars = payload.stargazers_count;

  return typeof stars === "number" ? stars : null;
}

export const getGithubStarCount = unstable_cache(
  async () => {
    try {
      return await fetchGithubRepoStars();
    } catch (error) {
      console.error("Failed to retrieve GitHub repo stars", error);
      return null;
    }
  },
  ["github-star-count"],
  {
    revalidate: 3600,
  }
);
