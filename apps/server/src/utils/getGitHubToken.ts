import { exec } from "node:child_process";
import { promisify } from "node:util";
import {
  getCachedGitHubToken,
  authenticateWithGitHub,
  verifyGitHubToken,
} from "./githubAuth.js";
import { serverLogger } from "./fileLogger.js";

const execAsync = promisify(exec);

/**
 * Get GitHub token with fallback to gh CLI if needed
 * Prioritizes in-memory session token to avoid keychain prompts
 */
export async function getGitHubTokenFromKeychain(): Promise<string | null> {
  try {
    // First, check if we have a valid cached token (no keychain prompt!)
    const cachedToken = getCachedGitHubToken();
    if (cachedToken) {
      // Verify it's still valid
      const isValid = await verifyGitHubToken(cachedToken);
      if (isValid) {
        return cachedToken;
      }
      serverLogger.info("Cached token is invalid, will try alternative auth");
    }

    // Fallback: Try gh CLI (but this will trigger keychain prompt)
    // Only use this as a last resort or if user explicitly set up gh CLI
    try {
      const { stdout: ghToken } = await execAsync(
        "bash -lc 'gh auth token 2>/dev/null'"
      );
      if (ghToken.trim()) {
        serverLogger.info("Using token from gh CLI");
        return ghToken.trim();
      }
    } catch {
      // gh not available or not authenticated
    }

    // No token available - user needs to authenticate
    serverLogger.info("No GitHub token found. Please authenticate.");
    return null;
  } catch {
    return null;
  }
}

/**
 * Get GitHub token, prompting for authentication if needed
 * This is a non-interactive version that returns null if no token exists
 */
export async function getGitHubToken(): Promise<string | null> {
  return getGitHubTokenFromKeychain();
}

/**
 * Ensure GitHub token exists, authenticating if necessary
 * This version will trigger the authentication flow if no token exists
 */
export async function ensureGitHubToken(): Promise<string | null> {
  const existingToken = await getGitHubTokenFromKeychain();
  if (existingToken) {
    return existingToken;
  }

  // No token found, start authentication flow
  serverLogger.info("Starting GitHub authentication...");
  const newToken = await authenticateWithGitHub();
  return newToken;
}

export async function getGitCredentialsFromHost(): Promise<{
  username?: string;
  password?: string;
} | null> {
  const token = await getGitHubTokenFromKeychain();

  if (token) {
    // GitHub tokens use 'oauth' as username
    return {
      username: "oauth",
      password: token,
    };
  }

  return null;
}
