/**
 * Utility for parsing GitHub URLs (PRs, branches, repos) into workspace creation params
 */

export interface GitHubUrlInfo {
  owner: string;
  repo: string;
  projectFullName: string;
  branch?: string;
  prNumber?: number;
  type: "pr" | "branch" | "repo";
}

/**
 * Parses a GitHub URL and extracts repository and branch/PR information
 *
 * Supported formats:
 * - PR: https://github.com/owner/repo/pull/123
 * - Branch: https://github.com/owner/repo/tree/branch-name
 * - Repo: https://github.com/owner/repo
 *
 * @param url - The GitHub URL to parse
 * @returns Parsed information or null if invalid
 */
export function parseGitHubUrl(url: string): GitHubUrlInfo | null {
  try {
    const trimmed = url.trim();

    // Handle both with and without protocol
    const urlToParse = trimmed.startsWith("http") ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlToParse);

    // Only accept github.com URLs
    if (parsed.hostname !== "github.com") {
      return null;
    }

    // Parse pathname: /owner/repo/pull/123 or /owner/repo/tree/branch-name
    const pathParts = parsed.pathname.split("/").filter(Boolean);

    if (pathParts.length < 2) {
      return null;
    }

    const [owner, repo, type, ...rest] = pathParts;
    const projectFullName = `${owner}/${repo}`;

    // Handle PR URL: /owner/repo/pull/123
    if (type === "pull" && rest.length > 0) {
      const prNumber = parseInt(rest[0], 10);
      if (isNaN(prNumber)) {
        return null;
      }

      return {
        owner,
        repo,
        projectFullName,
        prNumber,
        type: "pr",
      };
    }

    // Handle branch URL: /owner/repo/tree/branch-name
    if (type === "tree" && rest.length > 0) {
      const branch = rest.join("/"); // Handle branches with slashes

      return {
        owner,
        repo,
        projectFullName,
        branch,
        type: "branch",
      };
    }

    // Handle plain repo URL: /owner/repo
    if (!type || pathParts.length === 2) {
      return {
        owner,
        repo,
        projectFullName,
        type: "repo",
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Checks if a string looks like a GitHub URL
 */
export function isGitHubUrl(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.includes("github.com") &&
    (trimmed.startsWith("http://") ||
      trimmed.startsWith("https://") ||
      trimmed.startsWith("github.com/"))
  );
}
