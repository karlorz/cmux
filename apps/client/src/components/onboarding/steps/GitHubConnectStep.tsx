import { Button } from "@/components/ui/button";
import { GitHubIcon } from "@/components/icons/github";
import { ArrowRight, Check, ExternalLink, Info } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@cmux/convex/api";
import { useMutation, useQuery } from "convex/react";
import { env } from "@/client-env";

interface GitHubConnectStepProps {
  teamSlugOrId: string;
  onNext: () => void;
  onSkip: () => void;
  onGitHubConnected: () => void;
  hasConnection: boolean;
}

export function GitHubConnectStep({
  teamSlugOrId,
  onNext,
  onSkip,
  onGitHubConnected,
  hasConnection,
}: GitHubConnectStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [localHasConnection, setLocalHasConnection] = useState(hasConnection);

  const connections = useQuery(api.github.listProviderConnections, {
    teamSlugOrId,
  });
  const mintInstallState = useMutation(api.github_app.mintInstallState);

  useEffect(() => {
    if (connections && connections.length > 0 && !localHasConnection) {
      setLocalHasConnection(true);
      onGitHubConnected();
    }
  }, [connections, localHasConnection, onGitHubConnected]);

  const handleConnect = useCallback(async () => {
    setIsConnecting(true);
    try {
      const { state } = await mintInstallState({
        teamSlugOrId,
        returnUrl: window.location.href,
      });

      const githubAppSlug = env.NEXT_PUBLIC_GITHUB_APP_SLUG ?? "cmux-dev";
      const installUrl = new URL(
        `https://github.com/apps/${githubAppSlug}/installations/new`
      );
      installUrl.searchParams.set("state", state);

      const width = 600;
      const height = 800;
      const left = Math.max(0, (window.screen.width - width) / 2);
      const top = Math.max(0, (window.screen.height - height) / 2);

      const popup = window.open(
        installUrl.href,
        "github-install",
        `width=${width},height=${height},left=${left},top=${top},popup=yes`
      );

      if (!popup) {
        throw new Error(
          "Failed to open popup. Please allow popups for this site."
        );
      }

      const handleMessage = (event: MessageEvent) => {
        if (
          event.origin === window.location.origin &&
          event.data?.type === "cmux/github-install-complete"
        ) {
          window.removeEventListener("message", handleMessage);
          setLocalHasConnection(true);
          onGitHubConnected();
          setIsConnecting(false);
        }
      };

      window.addEventListener("message", handleMessage);

      const checkInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkInterval);
          window.removeEventListener("message", handleMessage);
          setIsConnecting(false);
        }
      }, 500);
    } catch (error) {
      console.error("Failed to connect GitHub:", error);
      setIsConnecting(false);
    }
  }, [teamSlugOrId, mintInstallState, onGitHubConnected]);

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h2 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Connect Your GitHub Account
        </h2>
        <p className="text-neutral-600 dark:text-neutral-400">
          Connect your GitHub account to access your repositories and collaborate with your team.
        </p>
      </div>

      {localHasConnection ? (
        <div className="mb-6 rounded-xl border border-green-200 bg-green-50 p-6 dark:border-green-900/50 dark:bg-green-900/20">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-500 text-white">
              <Check className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <h3 className="mb-1 font-semibold text-green-900 dark:text-green-100">
                GitHub Connected Successfully
              </h3>
              <p className="text-sm text-green-700 dark:text-green-300">
                Your GitHub account is now connected. You can access your repositories and start syncing them.
              </p>
              {connections && connections.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {connections.map((conn) => (
                    <div
                      key={conn.installationId}
                      className="flex items-center gap-2 rounded-md bg-white px-3 py-1.5 text-sm shadow-sm dark:bg-neutral-900"
                    >
                      <GitHubIcon className="h-4 w-4" />
                      <span className="font-medium text-neutral-900 dark:text-neutral-100">
                        {conn.accountLogin}
                      </span>
                      <span className="text-neutral-500 dark:text-neutral-400">
                        ({conn.accountType})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <Info className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1">
                <h3 className="mb-2 font-semibold text-neutral-900 dark:text-neutral-100">
                  What You'll Get
                </h3>
                <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>Access to all your repositories</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>Automatic PR creation and management</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>Real-time synchronization with your codebase</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                    <span>Automated code reviews and insights</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>

          <Button
            size="lg"
            onClick={handleConnect}
            disabled={isConnecting}
            className="mb-4 w-full gap-2"
          >
            <GitHubIcon className="h-5 w-5" />
            {isConnecting ? "Connecting..." : "Connect GitHub Account"}
            <ExternalLink className="h-4 w-4" />
          </Button>
        </>
      )}

      <div className="flex items-center justify-between pt-4">
        <Button variant="ghost" onClick={onSkip} disabled={isConnecting}>
          Skip for Now
        </Button>
        {localHasConnection && (
          <Button onClick={onNext} className="gap-2">
            Continue
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
