import { ChevronLeft, ChevronRight, History } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { isElectron } from "@/lib/electron";

export function HistoryNavigation() {
	const router = useRouter();
	const [canGoBack, setCanGoBack] = useState(false);
	const [showHistory, setShowHistory] = useState(false);

	// Update navigation state when location changes
	useEffect(() => {
		const updateNavigationState = () => {
			// Check if we can navigate back
			// TanStack Router's history doesn't expose canGoBack/canGoForward directly
			// so we'll track this via the history stack length
			setCanGoBack(window.history.length > 1);
		};

		updateNavigationState();

		// Listen to router updates
		const unsubscribe = router.subscribe("onResolved", updateNavigationState);

		return () => {
			unsubscribe();
		};
	}, [router]);

	const handleBack = () => {
		router.history.back();
	};

	const handleForward = () => {
		router.history.forward();
	};

	const handleHistoryToggle = () => {
		setShowHistory(!showHistory);
	};

	// Keyboard shortcuts
	useEffect(() => {
		if (isElectron && window.cmux?.on) {
			const offBack = window.cmux.on("shortcut:history-back", () => {
				handleBack();
			});
			const offForward = window.cmux.on("shortcut:history-forward", () => {
				handleForward();
			});
			const offHistory = window.cmux.on("shortcut:history-view", () => {
				handleHistoryToggle();
			});
			return () => {
				if (typeof offBack === "function") offBack();
				if (typeof offForward === "function") offForward();
				if (typeof offHistory === "function") offHistory();
			};
		}

		// Fallback for web browser
		const handleKeyDown = (e: KeyboardEvent) => {
			// Ctrl+Cmd+[ for back
			if (
				e.ctrlKey &&
				e.metaKey &&
				e.key === "[" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleBack();
			}
			// Ctrl+Cmd+] for forward
			else if (
				e.ctrlKey &&
				e.metaKey &&
				e.key === "]" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleForward();
			}
			// Ctrl+Cmd+Y for history
			else if (
				e.ctrlKey &&
				e.metaKey &&
				e.key.toLowerCase() === "y" &&
				!e.shiftKey &&
				!e.altKey
			) {
				e.preventDefault();
				handleHistoryToggle();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	return (
		<div className="flex items-center gap-1">
			<button
				onClick={handleBack}
				disabled={!canGoBack}
				className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
				title="Go back (Ctrl+Cmd+[)"
				aria-label="Go back"
			>
				<ChevronLeft className="w-4 h-4" />
			</button>
			<button
				onClick={handleForward}
				className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
				title="Go forward (Ctrl+Cmd+])"
				aria-label="Go forward"
			>
				<ChevronRight className="w-4 h-4" />
			</button>
			<button
				onClick={handleHistoryToggle}
				className="p-1.5 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
				title="View history (Ctrl+Cmd+Y)"
				aria-label="View history"
			>
				<History className="w-4 h-4" />
			</button>
		</div>
	);
}
