export interface ParsedGithubPullRequestUrl {
  owner: string;
  repo: string;
  number: number;
  repoFullName: string;
  url: string;
}

const GITHUB_HOSTNAMES = new Set(["github.com", "www.github.com"]);

/**
 * Parses a GitHub pull request URL (e.g. https://github.com/owner/repo/pull/123)
 * and returns the owner, repo, PR number, and canonical URL.
 */
export function parseGithubPullRequestUrl(
  input: string
): ParsedGithubPullRequestUrl | null {
  if (!input) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(input.trim());
  } catch {
    return null;
  }

  if (!GITHUB_HOSTNAMES.has(parsed.hostname.toLowerCase())) {
    return null;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  if (segments.length < 4) {
    return null;
  }

  const [owner, repo, pullSegment, prNumberSegment] = segments;
  if (!owner || !repo || pullSegment !== "pull") {
    return null;
  }

  const parsedNumber = Number(prNumberSegment);
  if (!Number.isInteger(parsedNumber) || parsedNumber <= 0) {
    return null;
  }

  const canonicalUrl = `https://github.com/${owner}/${repo}/pull/${parsedNumber}`;
  return {
    owner,
    repo,
    number: parsedNumber,
    repoFullName: `${owner}/${repo}`,
    url: canonicalUrl,
  };
}
