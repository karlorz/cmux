import { useCallback, useEffect, useState } from "react";
import { isElectron } from "@/lib/electron";

const STORAGE_KEY = "sidebarHidden";

export interface UseSidebarVisibilityResult {
  isHidden: boolean;
  setIsHidden: (hidden: boolean) => void;
  toggleSidebar: () => void;
}

/**
 * Hook to manage sidebar visibility state.
 * Persists state to localStorage and syncs across tabs via storage events.
 * Also listens for electron shortcut events if running in electron.
 */
export function useSidebarVisibility(): UseSidebarVisibilityResult {
  const [isHidden, setIsHiddenState] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "true";
  });

  const setIsHidden = useCallback((hidden: boolean) => {
    setIsHiddenState(hidden);
    localStorage.setItem(STORAGE_KEY, String(hidden));
  }, []);

  const toggleSidebar = useCallback(() => {
    setIsHiddenState((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, String(next));
      return next;
    });
  }, []);

  // Keyboard shortcut to toggle sidebar (Ctrl+Shift+S)
  useEffect(() => {
    if (isElectron && window.cmux?.on) {
      const off = window.cmux.on("shortcut:sidebar-toggle", () => {
        toggleSidebar();
      });
      return () => {
        if (typeof off === "function") off();
      };
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.ctrlKey &&
        e.shiftKey &&
        !e.altKey &&
        !e.metaKey &&
        (e.code === "KeyS" || e.key.toLowerCase() === "s")
      ) {
        e.preventDefault();
        e.stopPropagation();
        toggleSidebar();
      }
    };

    // Use capture phase to intercept before browser default handlers
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggleSidebar]);

  // Listen for storage events from command bar (sidebar visibility sync)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue !== null) {
        setIsHiddenState(e.newValue === "true");
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  return {
    isHidden,
    setIsHidden,
    toggleSidebar,
  };
}
