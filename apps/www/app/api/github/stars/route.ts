import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const revalidate = 3600; // Cache for 1 hour

const GITHUB_REPO = "manaflow-ai/cmux";

export async function GET() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `token ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        next: {
          revalidate: 3600, // Cache for 1 hour
        },
      }
    );

    if (!response.ok) {
      console.error("[github-stars] Failed to fetch stars", {
        status: response.status,
        statusText: response.statusText,
      });
      return NextResponse.json(
        { error: "Failed to fetch stars" },
        { status: response.status }
      );
    }

    const data = await response.json();
    const stargazersCount = data.stargazers_count;

    // Format the star count (e.g., 1234 -> 1.2K)
    let formattedCount: string;
    if (stargazersCount >= 1000) {
      formattedCount = `${(stargazersCount / 1000).toFixed(1)}K`;
    } else {
      formattedCount = stargazersCount.toString();
    }

    return NextResponse.json(
      {
        count: stargazersCount,
        formatted: formattedCount,
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=7200",
        },
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[github-stars] Unexpected failure", {
      message,
      error,
    });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
