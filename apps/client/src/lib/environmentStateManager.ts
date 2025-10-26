/**
 * Environment State Manager
 *
 * Manages persistence of environment working state to localStorage.
 * This ensures users don't lose their progress when navigating away from
 * an environment and then coming back.
 */

export interface EnvironmentWorkingState {
  // Form fields
  name?: string;
  description?: string;
  maintenanceScript?: string;
  devScript?: string;
  exposedPorts?: Array<{ port: number; name?: string }>;
  selectedRepos?: string[];

  // UI state
  activeTab?: string;
  scrollPosition?: number;
  panelWidth?: number;

  // Preview state
  vscodeUrl?: string;
  browserUrl?: string;

  // Metadata
  lastModified: number;
  isDraft: boolean;
}

const STORAGE_PREFIX = 'cmux_env_state_';
const STATE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Get the storage key for an environment
 */
function getStorageKey(environmentId: string | 'new'): string {
  return `${STORAGE_PREFIX}${environmentId}`;
}

/**
 * Save environment working state to localStorage
 */
export function saveEnvironmentState(
  environmentId: string | 'new',
  state: Partial<EnvironmentWorkingState>
): void {
  try {
    const storageKey = getStorageKey(environmentId);
    const existingState = getEnvironmentState(environmentId);

    const newState: EnvironmentWorkingState = {
      ...existingState,
      ...state,
      lastModified: Date.now(),
      isDraft: true,
    };

    localStorage.setItem(storageKey, JSON.stringify(newState));
  } catch (error) {
    console.error('Failed to save environment state:', error);
  }
}

/**
 * Get environment working state from localStorage
 */
export function getEnvironmentState(
  environmentId: string | 'new'
): EnvironmentWorkingState | null {
  try {
    const storageKey = getStorageKey(environmentId);
    const stored = localStorage.getItem(storageKey);

    if (!stored) {
      return null;
    }

    const state = JSON.parse(stored) as EnvironmentWorkingState;

    // Check if state has expired
    if (Date.now() - state.lastModified > STATE_EXPIRY_MS) {
      clearEnvironmentState(environmentId);
      return null;
    }

    return state;
  } catch (error) {
    console.error('Failed to get environment state:', error);
    return null;
  }
}

/**
 * Clear environment working state from localStorage
 */
export function clearEnvironmentState(environmentId: string | 'new'): void {
  try {
    const storageKey = getStorageKey(environmentId);
    localStorage.removeItem(storageKey);
  } catch (error) {
    console.error('Failed to clear environment state:', error);
  }
}

/**
 * Clear all expired environment states
 */
export function clearExpiredStates(): void {
  try {
    const keys = Object.keys(localStorage);
    const now = Date.now();

    for (const key of keys) {
      if (key.startsWith(STORAGE_PREFIX)) {
        try {
          const stored = localStorage.getItem(key);
          if (stored) {
            const state = JSON.parse(stored) as EnvironmentWorkingState;
            if (now - state.lastModified > STATE_EXPIRY_MS) {
              localStorage.removeItem(key);
            }
          }
        } catch {
          // If we can't parse it, remove it
          localStorage.removeItem(key);
        }
      }
    }
  } catch (error) {
    console.error('Failed to clear expired states:', error);
  }
}

/**
 * Check if there's a draft state for an environment
 */
export function hasDraftState(environmentId: string | 'new'): boolean {
  const state = getEnvironmentState(environmentId);
  return state !== null && state.isDraft;
}

/**
 * Mark environment state as saved (no longer a draft)
 */
export function markStateSaved(environmentId: string | 'new'): void {
  try {
    const state = getEnvironmentState(environmentId);
    if (state) {
      state.isDraft = false;
      state.lastModified = Date.now();
      const storageKey = getStorageKey(environmentId);
      localStorage.setItem(storageKey, JSON.stringify(state));
    }
  } catch (error) {
    console.error('Failed to mark state as saved:', error);
  }
}
