import { useStackApp, useUser } from "@stackframe/react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { useCallback, useState } from "react";
import { stackClientApp } from "@/lib/stack";

interface GitHubConnectionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  title?: string;
  message?: string;
}

export function GitHubConnectionDialog({
  isOpen,
  onClose,
  onSuccess,
  title = "GitHub Connection Required",
  message = "To use this feature, you need to connect your GitHub account. This allows us to access repositories and configure git credentials in your environments.",
}: GitHubConnectionDialogProps) {
  const app = useStackApp();
  const user = useUser({ or: "return-null" });
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = useCallback(async () => {
    if (!user) {
      // If no user, redirect to sign in
      await stackClientApp.redirectToSignIn?.();
      return;
    }

    setIsConnecting(true);
    try {
      // Get the account settings URL from Stack
      const accountSettingsUrl = app.urls.accountSettings;

      // Open in a popup window
      const width = 800;
      const height = 700;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        accountSettingsUrl,
        "github-connect",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
      );

      if (popup) {
        // Listen for the connection complete message
        const handleMessage = (event: MessageEvent) => {
          if (event.data?.type === "cmux/github-connect-complete") {
            window.removeEventListener("message", handleMessage);
            setIsConnecting(false);
            onSuccess?.();
            onClose();
          }
        };

        window.addEventListener("message", handleMessage);

        // Check if popup was closed without completing
        const checkClosed = setInterval(() => {
          if (popup.closed) {
            clearInterval(checkClosed);
            window.removeEventListener("message", handleMessage);
            setIsConnecting(false);
            // Even if closed without explicit success, invalidate to refresh state
            onSuccess?.();
          }
        }, 500);
      } else {
        // Fallback if popup was blocked - redirect in same window
        window.location.href = accountSettingsUrl;
      }
    } catch (error) {
      console.error("Failed to open account settings:", error);
      setIsConnecting(false);
    }
  }, [app.urls.accountSettings, user, onSuccess, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center px-4 bg-black/50 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-950 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="github-dialog-title"
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className="flex-shrink-0 mt-0.5">
              <div className="h-10 w-10 rounded-full bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2
                id="github-dialog-title"
                className="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
              >
                {title}
              </h2>
              <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                {message}
              </p>
              <div className="mt-4 rounded-md border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50 p-3">
                <p className="text-xs text-neutral-600 dark:text-neutral-400">
                  You'll be redirected to your account settings where you can:
                </p>
                <ul className="mt-2 space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                  <li className="flex items-center gap-2">
                    <span className="text-neutral-400">•</span>
                    Connect your GitHub account
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="text-neutral-400">•</span>
                    Authorize repository access
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={handleConnect}
              disabled={isConnecting}
              className="inline-flex items-center justify-center gap-2 rounded-md bg-neutral-900 text-white px-4 py-2 text-sm hover:bg-neutral-800 disabled:bg-neutral-300 dark:disabled:bg-neutral-700 disabled:cursor-not-allowed dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 transition-colors"
            >
              {isConnecting ? (
                <>
                  <span className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connecting...
                </>
              ) : (
                <>
                  Open Account Settings
                  <ExternalLink className="h-4 w-4" />
                </>
              )}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={isConnecting}
              className="inline-flex items-center justify-center rounded-md border border-neutral-200 dark:border-neutral-800 px-4 py-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-900 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
