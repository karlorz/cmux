/**
 * Git URL sanitization utilities
 *
 * Handles removal of embedded credentials from git URLs to prevent
 * stale tokens from persisting in .git/config
 */

/**
 * Remove embedded credentials from a git URL
 * @example
 * sanitizeGitUrl("https://x-access-token:TOKEN@github.com/user/repo.git")
 * // Returns: "https://github.com/user/repo.git"
 */
export function sanitizeGitUrl(url: string): string {
  return url.replace(/\/\/[^@]+@/, "//");
}

/**
 * Check if a git URL has embedded credentials
 */
export function hasEmbeddedCredentials(url: string): boolean {
  return /\/\/[^@]+@/.test(url);
}
