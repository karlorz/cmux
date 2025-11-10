export interface ParsedGithubPullRequestUrl {
  owner: string;
  repo: string;
  fullName: string;
  pullNumber: number;
  normalizedUrl: string;
}

const GITHUB_HOSTS = new Set(["github.com", "www.github.com"]);

/**
 * Parse a GitHub pull request URL into its components.
 * Returns null when the input does not resemble a PR URL.
 */
export function parseGithubPullRequestUrl(
  input: string
): ParsedGithubPullRequestUrl | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const candidate = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  const hostname = url.hostname.toLowerCase();
  if (!GITHUB_HOSTS.has(hostname)) {
    return null;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length < 4) {
    return null;
  }

  const [ownerRaw, repoRaw, pullKeywordRaw, pullNumberRaw] = segments;
  if (!ownerRaw || !repoRaw) {
    return null;
  }

  const pullKeyword = pullKeywordRaw.toLowerCase();
  if (pullKeyword !== "pull" && pullKeyword !== "pulls") {
    return null;
  }

  const pullNumber = Number.parseInt(pullNumberRaw, 10);
  if (!Number.isFinite(pullNumber) || pullNumber <= 0) {
    return null;
  }

  const owner = decodeURIComponent(ownerRaw);
  const repo = decodeURIComponent(repoRaw).replace(/\.git$/i, "");
  const fullName = `${owner}/${repo}`;
  const normalizedUrl = `https://github.com/${owner}/${repo}/pull/${pullNumber}`;

  return {
    owner,
    repo,
    fullName,
    pullNumber,
    normalizedUrl,
  };
}
