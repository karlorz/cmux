/**
 * Parses GitHub URLs to extract repository and reference information
 */

export interface GitHubUrlParseResult {
  type: "pr" | "branch" | "repo";
  owner: string;
  repo: string;
  fullName: string;
  prNumber?: number;
  branch?: string;
  originalUrl: string;
}

/**
 * Parses a GitHub URL and extracts repository and reference information.
 * Supports:
 * - PR URLs: https://github.com/owner/repo/pull/123
 * - Branch URLs: https://github.com/owner/repo/tree/branch-name
 * - Repo URLs: https://github.com/owner/repo
 *
 * @param input - GitHub URL or owner/repo string
 * @returns Parsed result or null if invalid
 */
export function parseGitHubUrl(input: string): GitHubUrlParseResult | null {
  const trimmedInput = input.trim();

  // Handle owner/repo format (e.g., "facebook/react")
  const ownerRepoMatch = /^([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)$/.exec(trimmedInput);
  if (ownerRepoMatch) {
    const [, owner, repo] = ownerRepoMatch;
    return {
      type: "repo",
      owner,
      repo,
      fullName: `${owner}/${repo}`,
      originalUrl: trimmedInput,
    };
  }

  // Parse GitHub URLs
  let url: URL;
  try {
    url = new URL(trimmedInput);
  } catch {
    return null;
  }

  // Only handle github.com URLs
  if (url.hostname !== "github.com") {
    return null;
  }

  // Remove leading and trailing slashes from pathname
  const pathname = url.pathname.replace(/^\/+|\/+$/g, "");
  const parts = pathname.split("/");

  if (parts.length < 2) {
    return null;
  }

  const [owner, repo, ...rest] = parts;

  // Validate owner and repo
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) {
    return null;
  }

  const fullName = `${owner}/${repo}`;

  // Handle PR URLs: /owner/repo/pull/123
  if (rest.length >= 2 && rest[0] === "pull") {
    const prNumber = parseInt(rest[1], 10);
    if (isNaN(prNumber)) {
      return null;
    }
    return {
      type: "pr",
      owner,
      repo,
      fullName,
      prNumber,
      originalUrl: trimmedInput,
    };
  }

  // Handle branch URLs: /owner/repo/tree/branch-name
  if (rest.length >= 2 && rest[0] === "tree") {
    const branch = rest.slice(1).join("/"); // Support branches with slashes
    return {
      type: "branch",
      owner,
      repo,
      fullName,
      branch,
      originalUrl: trimmedInput,
    };
  }

  // Handle basic repo URL: /owner/repo
  if (rest.length === 0) {
    return {
      type: "repo",
      owner,
      repo,
      fullName,
      originalUrl: trimmedInput,
    };
  }

  // Unrecognized format
  return null;
}

/**
 * Checks if the input string looks like a GitHub URL or owner/repo format
 */
export function looksLikeGitHubUrl(input: string): boolean {
  const trimmed = input.trim();

  // Check for owner/repo format
  if (/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(trimmed)) {
    return true;
  }

  // Check for GitHub URL
  try {
    const url = new URL(trimmed);
    return url.hostname === "github.com";
  } catch {
    return false;
  }
}
