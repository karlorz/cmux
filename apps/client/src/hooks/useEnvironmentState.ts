/**
 * React hook for managing environment working state
 */

import { useCallback, useEffect, useRef } from 'react';
import {
  type EnvironmentWorkingState,
  saveEnvironmentState,
  getEnvironmentState,
  clearEnvironmentState,
  markStateSaved,
} from '../lib/environmentStateManager';

interface UseEnvironmentStateOptions {
  environmentId: string | 'new';
  autoSave?: boolean;
  debounceMs?: number;
  onStateRestored?: (state: EnvironmentWorkingState) => void;
}

interface UseEnvironmentStateReturn {
  saveState: (state: Partial<EnvironmentWorkingState>) => void;
  restoreState: () => EnvironmentWorkingState | null;
  clearState: () => void;
  markSaved: () => void;
  hasState: () => boolean;
}

export function useEnvironmentState({
  environmentId,
  autoSave = true,
  debounceMs = 1000,
  onStateRestored,
}: UseEnvironmentStateOptions): UseEnvironmentStateReturn {
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const hasRestoredRef = useRef(false);

  // Restore state on mount
  useEffect(() => {
    if (!hasRestoredRef.current) {
      const state = getEnvironmentState(environmentId);
      if (state && onStateRestored) {
        onStateRestored(state);
      }
      hasRestoredRef.current = true;
    }
  }, [environmentId, onStateRestored]);

  // Save state with debouncing
  const saveState = useCallback(
    (state: Partial<EnvironmentWorkingState>) => {
      if (!autoSave) {
        saveEnvironmentState(environmentId, state);
        return;
      }

      // Clear existing timer
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      // Set new timer
      debounceTimerRef.current = setTimeout(() => {
        saveEnvironmentState(environmentId, state);
        debounceTimerRef.current = null;
      }, debounceMs);
    },
    [environmentId, autoSave, debounceMs]
  );

  // Restore state
  const restoreState = useCallback(() => {
    return getEnvironmentState(environmentId);
  }, [environmentId]);

  // Clear state
  const clearState = useCallback(() => {
    clearEnvironmentState(environmentId);
  }, [environmentId]);

  // Mark as saved
  const markSaved = useCallback(() => {
    markStateSaved(environmentId);
  }, [environmentId]);

  // Check if has state
  const hasState = useCallback(() => {
    return getEnvironmentState(environmentId) !== null;
  }, [environmentId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return {
    saveState,
    restoreState,
    clearState,
    markSaved,
    hasState,
  };
}
