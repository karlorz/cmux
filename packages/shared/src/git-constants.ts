/**
 * Git-related constants used across the application.
 */

/**
 * Default branch prefix used when creating new branches.
 * Users can customize this in Settings > Git, including setting to empty string for no prefix.
 *
 * @example
 * ```ts
 * // With default prefix: "dev/fix-login-bug"
 * // With empty prefix: "fix-login-bug"
 * const branchName = `${DEFAULT_BRANCH_PREFIX}${taskSlug}`;
 * ```
 */
export const DEFAULT_BRANCH_PREFIX = "dev/";
