/**
 * Manages the cloud mode onboarding state for repositories.
 * Tracks which repositories have shown the onboarding modal to avoid
 * showing it multiple times.
 */

const ONBOARDING_KEY_PREFIX = "cloudModeOnboarding";

/**
 * Check if the onboarding modal has been shown for a specific repository
 * @param teamSlugOrId - Team identifier
 * @param repoFullName - Full repository name (e.g., "owner/repo")
 * @returns true if onboarding has been shown, false otherwise
 */
export function hasShownOnboarding(
  teamSlugOrId: string,
  repoFullName: string
): boolean {
  if (!teamSlugOrId || !repoFullName) {
    return false;
  }

  try {
    const key = `${ONBOARDING_KEY_PREFIX}:${teamSlugOrId}:${repoFullName}`;
    const value = localStorage.getItem(key);
    return value === "true";
  } catch (error) {
    console.warn("Failed to check cloud mode onboarding state", error);
    return false;
  }
}

/**
 * Mark the onboarding modal as shown for a specific repository
 * @param teamSlugOrId - Team identifier
 * @param repoFullName - Full repository name (e.g., "owner/repo")
 */
export function markOnboardingShown(
  teamSlugOrId: string,
  repoFullName: string
): void {
  if (!teamSlugOrId || !repoFullName) {
    return;
  }

  try {
    const key = `${ONBOARDING_KEY_PREFIX}:${teamSlugOrId}:${repoFullName}`;
    localStorage.setItem(key, "true");
  } catch (error) {
    console.warn("Failed to mark cloud mode onboarding as shown", error);
  }
}

/**
 * Reset the onboarding state for a specific repository (useful for testing)
 * @param teamSlugOrId - Team identifier
 * @param repoFullName - Full repository name (e.g., "owner/repo")
 */
export function resetOnboarding(
  teamSlugOrId: string,
  repoFullName: string
): void {
  if (!teamSlugOrId || !repoFullName) {
    return;
  }

  try {
    const key = `${ONBOARDING_KEY_PREFIX}:${teamSlugOrId}:${repoFullName}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.warn("Failed to reset cloud mode onboarding state", error);
  }
}

/**
 * Check if the user should see the onboarding modal based on:
 * - Cloud mode is enabled
 * - A repository is selected (not an environment)
 * - Onboarding hasn't been shown for this repo yet
 *
 * @param isCloudMode - Whether cloud mode is enabled
 * @param selectedProject - The selected project (repo or env:id)
 * @param teamSlugOrId - Team identifier
 * @returns true if onboarding should be shown, false otherwise
 */
export function shouldShowOnboarding(
  isCloudMode: boolean,
  selectedProject: string[],
  teamSlugOrId: string
): boolean {
  // Only show if cloud mode is enabled
  if (!isCloudMode) {
    return false;
  }

  // Check if a project is selected
  const project = selectedProject[0];
  if (!project) {
    return false;
  }

  // Don't show if an environment is selected (environments already have setup)
  if (project.startsWith("env:")) {
    return false;
  }

  // Check if we've already shown onboarding for this repo
  return !hasShownOnboarding(teamSlugOrId, project);
}
