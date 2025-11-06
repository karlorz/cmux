import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Github,
  Link2,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Shield,
  GitBranch,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import { saveOnboardingState } from "@/lib/onboarding";

interface GitHubConnectionStepProps {
  teamSlugOrId?: string;
}

export function GitHubConnectionStep({ teamSlugOrId }: GitHubConnectionStepProps) {
  const [isConnecting, setIsConnecting] = useState(false);

  // Check if GitHub is already connected
  const providerConnections = useQuery(
    api.github.listProviderConnections,
    teamSlugOrId ? { teamSlugOrId } : "skip"
  ) as Array<{
    id: string;
    login: string;
    type: string;
  }> | undefined;

  const isConnected = providerConnections && providerConnections.length > 0;

  useEffect(() => {
    if (isConnected) {
      saveOnboardingState({ githubConnected: true });
    }
  }, [isConnected]);

  const handleConnect = () => {
    setIsConnecting(true);
    // Initiate GitHub OAuth flow
    const returnUrl = window.location.pathname;
    sessionStorage.setItem("github_connection_return_url", returnUrl);

    // This would typically redirect to your GitHub OAuth endpoint
    window.location.href = `/api/github/connect?team=${teamSlugOrId}&return=${encodeURIComponent(returnUrl)}`;
  };

  return (
    <div className="space-y-6">
      <div className="text-center space-y-4">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.3 }}
          className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-neutral-800 to-neutral-600 flex items-center justify-center"
        >
          <Github className="h-10 w-10 text-white" />
        </motion.div>

        <div className="space-y-2">
          <h3 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
            {isConnected ? "GitHub Connected!" : "Connect Your GitHub Account"}
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 max-w-md mx-auto">
            {isConnected
              ? "Your GitHub account is connected. You can now sync repositories and manage pull requests."
              : "Connect your GitHub account to sync repositories and enable seamless code collaboration."}
          </p>
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-4 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400 flex-shrink-0" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">
                  GitHub account connected successfully
                </p>
                <p className="text-sm text-green-700 dark:text-green-300 mt-1">
                  You can now access your repositories and create pull requests.
                </p>
              </div>
            </div>
          </motion.div>

          <div className="grid gap-3">
            {providerConnections?.slice(0, 3).map((connection, index) => (
              <motion.div
                key={connection.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-3 p-3 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900"
              >
                <Github className="h-5 w-5 text-neutral-600 dark:text-neutral-400" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    {connection.login}
                  </p>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Connected {connection.type}
                  </p>
                </div>
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
              </motion.div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6 rounded-lg border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-16 h-16 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center">
                  <Link2 className="h-8 w-8 text-neutral-600 dark:text-neutral-400" />
                </div>
                <div className="space-y-2">
                  <p className="font-medium text-neutral-900 dark:text-neutral-100">
                    Ready to connect?
                  </p>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    We'll use GitHub OAuth to securely connect your account
                  </p>
                </div>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting}
                  className="gap-2 bg-neutral-900 hover:bg-neutral-800 dark:bg-white dark:hover:bg-neutral-100 dark:text-neutral-900"
                >
                  {isConnecting ? (
                    <>Connecting...</>
                  ) : (
                    <>
                      <Github className="h-4 w-4" />
                      Connect GitHub Account
                      <ExternalLink className="h-3 w-3" />
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900">
              <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400 mb-2" />
              <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Secure OAuth
              </p>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                Industry-standard authentication
              </p>
            </div>
            <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-900">
              <GitBranch className="h-5 w-5 text-purple-600 dark:text-purple-400 mb-2" />
              <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
                Full Access
              </p>
              <p className="text-xs text-purple-700 dark:text-purple-300 mt-1">
                Manage repos and PRs
              </p>
            </div>
            <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900">
              <Lock className="h-5 w-5 text-green-600 dark:text-green-400 mb-2" />
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Private Repos
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Access private repositories
              </p>
            </div>
          </div>

          <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  What we'll access:
                </p>
                <ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200">
                  <li>• Read access to your repositories</li>
                  <li>• Create and manage pull requests</li>
                  <li>• Read commit history and branches</li>
                  <li>• Manage GitHub App installations</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}