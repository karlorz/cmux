import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const DEFAULT_REPO = "manaflow-ai/cmux";
const CACHE_TAG = "github-stars";
const REVALIDATE_SECONDS = 60 * 15; // 15 minutes

type GithubRepoResponse = {
  stargazers_count?: number;
  updated_at?: string;
};

const resolveRepoSlug = () => {
  return process.env.CMUX_GITHUB_REPO ?? process.env.NEXT_PUBLIC_GITHUB_REPO ?? DEFAULT_REPO;
};

const resolveGithubToken = () => {
  return (
    process.env.GITHUB_TOKEN ??
    process.env.GITHUB_PAT ??
    process.env.GH_TOKEN ??
    process.env.GITHUB_PERSONAL_ACCESS_TOKEN ??
    process.env.GITHUB_AUTH_TOKEN ??
    null
  );
};

const fetchGithubRepo = unstable_cache(
  async () => {
    const repoSlug = resolveRepoSlug();
    const githubToken = resolveGithubToken();

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "cmux-www",
    };

    if (githubToken) {
      headers.Authorization = `Bearer ${githubToken}`;
    }

    const response = await fetch(`https://api.github.com/repos/${repoSlug}`, {
      headers,
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] },
    });

    if (!response.ok) {
      throw new Error(`GitHub API error ${response.status}`);
    }

    const payload = (await response.json()) as GithubRepoResponse;

    return {
      stars: typeof payload.stargazers_count === "number" ? payload.stargazers_count : null,
      repo: repoSlug,
      refreshedAt: payload.updated_at ?? new Date().toISOString(),
    };
  },
  [CACHE_TAG],
  { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAG] }
);

export async function GET() {
  try {
    const data = await fetchGithubRepo();
    return NextResponse.json(data, {
      headers: {
        "Cache-Control": `s-maxage=${REVALIDATE_SECONDS}, stale-while-revalidate=${REVALIDATE_SECONDS}`,
      },
    });
  } catch (error) {
    console.error("Failed to fetch GitHub stars", error);
    return NextResponse.json(
      { stars: null, repo: resolveRepoSlug(), refreshedAt: null },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
