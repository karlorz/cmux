import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Checks if an error is related to missing GitHub authentication
 */
export function isGitHubAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("GITHUB_NOT_CONNECTED") ||
    message.includes("GitHub account not connected") ||
    message.includes("Failed to resolve GitHub credentials")
  );
}
