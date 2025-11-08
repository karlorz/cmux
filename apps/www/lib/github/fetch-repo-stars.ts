import { CMUX_GITHUB_API_URL } from "@/lib/constants";

type GithubRepoResponse = {
  stargazers_count?: number;
};

const STAR_COUNT_REVALIDATE_SECONDS = 1800;

export async function fetchRepoStars(): Promise<number | null> {
  try {
    const response = await fetch(CMUX_GITHUB_API_URL, {
      headers: {
        Accept: "application/vnd.github+json",
      },
      next: {
        revalidate: STAR_COUNT_REVALIDATE_SECONDS,
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as GithubRepoResponse;
    const stargazersCount =
      typeof data.stargazers_count === "number" ? data.stargazers_count : null;

    return stargazersCount;
  } catch (error) {
    console.error("Failed to retrieve GitHub repository stars", error);
    return null;
  }
}
