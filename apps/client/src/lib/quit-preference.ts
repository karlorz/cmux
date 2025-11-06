const STORAGE_KEY = "quit-without-confirmation";

/**
 * Check if the user has enabled "always quit without confirmation"
 */
export function shouldSkipQuitConfirmation(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

/**
 * Set the "always quit" preference
 */
export function setQuitPreference(alwaysQuit: boolean): void {
  try {
    if (alwaysQuit) {
      localStorage.setItem(STORAGE_KEY, "true");
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }
}

/**
 * Reset the "always quit" preference (useful for settings)
 */
export function resetQuitPreference(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
