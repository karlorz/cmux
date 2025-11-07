import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, History } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { isElectron } from "@/lib/electron";

// Simple history stack tracker
let historyStack: string[] = [];
let currentHistoryIndex = -1;

export function SidebarHistoryNavigation() {
  const router = useRouter();
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);

  // Track navigation changes and update history stack
  useEffect(() => {
    const updateHistoryState = () => {
      const currentPath = window.location.pathname + window.location.search;

      // If we're navigating forward/back programmatically, don't update the stack
      if (historyStack[currentHistoryIndex] === currentPath) {
        setCanGoBack(currentHistoryIndex > 0);
        setCanGoForward(currentHistoryIndex < historyStack.length - 1);
        return;
      }

      // New navigation: add to stack and truncate forward history
      currentHistoryIndex++;
      historyStack = historyStack.slice(0, currentHistoryIndex);
      historyStack.push(currentPath);

      setCanGoBack(currentHistoryIndex > 0);
      setCanGoForward(false);
    };

    updateHistoryState();

    // Listen to router state changes
    const unsubscribe = router.subscribe("onBeforeLoad", () => {
      // Update after navigation with a small delay to ensure route is loaded
      setTimeout(updateHistoryState, 10);
    });

    return unsubscribe;
  }, [router]);

  // Handle keyboard shortcuts from Electron
  useEffect(() => {
    if (isElectron && window.cmux?.on) {
      const offBack = window.cmux.on("shortcut:history-back", () => {
        handleBack();
      });
      const offForward = window.cmux.on("shortcut:history-forward", () => {
        handleForward();
      });
      const offHistory = window.cmux.on("shortcut:history-menu", () => {
        handleHistoryMenu();
      });

      return () => {
        if (typeof offBack === "function") offBack();
        if (typeof offForward === "function") offForward();
        if (typeof offHistory === "function") offHistory();
      };
    }

    // Fallback keyboard shortcuts for non-Electron
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+Ctrl+[ for back
      if (e.metaKey && e.ctrlKey && e.key === "[") {
        e.preventDefault();
        handleBack();
      }
      // Cmd+Ctrl+] for forward
      else if (e.metaKey && e.ctrlKey && e.key === "]") {
        e.preventDefault();
        handleForward();
      }
      // Cmd+Ctrl+Y for history menu
      else if (e.metaKey && e.ctrlKey && e.key.toLowerCase() === "y") {
        e.preventDefault();
        handleHistoryMenu();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleBack = () => {
    if (canGoBack && currentHistoryIndex > 0) {
      currentHistoryIndex--;
      const targetPath = historyStack[currentHistoryIndex];
      if (targetPath) {
        router.history.back();
        setCanGoBack(currentHistoryIndex > 0);
        setCanGoForward(currentHistoryIndex < historyStack.length - 1);
      }
    }
  };

  const handleForward = () => {
    if (canGoForward && currentHistoryIndex < historyStack.length - 1) {
      currentHistoryIndex++;
      const targetPath = historyStack[currentHistoryIndex];
      if (targetPath) {
        router.history.forward();
        setCanGoBack(currentHistoryIndex > 0);
        setCanGoForward(currentHistoryIndex < historyStack.length - 1);
      }
    }
  };

  const handleHistoryMenu = () => {
    // For now, just log - we can implement a dropdown menu later
    console.log("History menu requested");
    console.log("History stack:", historyStack);
    console.log("Current index:", currentHistoryIndex);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={handleBack}
        disabled={!canGoBack}
        className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        title="Back (Cmd+Ctrl+[)"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <ArrowLeft
          className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={handleForward}
        disabled={!canGoForward}
        className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
        title="Forward (Cmd+Ctrl+])"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <ArrowRight
          className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        onClick={handleHistoryMenu}
        className="w-[25px] h-[25px] border border-neutral-200 dark:border-neutral-800 hover:bg-neutral-100 dark:hover:bg-neutral-900 rounded-lg flex items-center justify-center transition-colors cursor-default"
        title="History (Cmd+Ctrl+Y)"
        style={{ WebkitAppRegion: "no-drag" } as CSSProperties}
      >
        <History
          className="w-4 h-4 text-neutral-700 dark:text-neutral-300"
          aria-hidden="true"
        />
      </button>
    </div>
  );
}
