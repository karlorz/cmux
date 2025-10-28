"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

type CallbackStatus = "processing" | "success" | "error";

interface GitHubCallbackState {
  teamId?: string;
  returnPath?: string;
  repository?: string;
  pullRequest?: number;
}

export default function GitHubCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<CallbackStatus>("processing");
  const [error, setError] = useState<string | null>(null);
  const [returnPath, setReturnPath] = useState<string>("/");

  useEffect(() => {
    const processCallback = async () => {
      try {
        // Get installation ID from GitHub callback
        const installationId = searchParams.get("installation_id");
        const setupAction = searchParams.get("setup_action");
        const stateParam = searchParams.get("state");

        // Parse state to get our context
        let state: GitHubCallbackState = {};
        if (stateParam) {
          try {
            state = JSON.parse(decodeURIComponent(stateParam));
          } catch (e) {
            console.error("Failed to parse state parameter:", e);
          }
        }

        // Check session storage as fallback
        if (!state.returnPath && typeof window !== "undefined") {
          const storedPath = sessionStorage.getItem("cmux_auth_return_path");
          if (storedPath) {
            state.returnPath = storedPath;
          }
        }

        setReturnPath(state.returnPath || "/");

        if (!installationId) {
          throw new Error("No installation ID received from GitHub");
        }

        // Verify the installation was successful
        if (setupAction === "install" || setupAction === "update") {
          // Call your backend to verify and store the installation
          const response = await fetch("/api/github/installation", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              installationId: parseInt(installationId, 10),
              teamId: state.teamId,
              repository: state.repository,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(
              errorData.message || `Failed to verify GitHub installation: ${response.statusText}`
            );
          }

          const data = await response.json();

          // Check if we have access to the specific repository
          if (state.repository && data.repositories) {
            const hasAccess = data.repositories.some(
              (repo: any) => repo.full_name === state.repository
            );

            if (!hasAccess) {
              throw new Error(
                `The cmux-agent app was not granted access to ${state.repository}. Please ensure you selected this repository during installation.`
              );
            }
          }

          setStatus("success");

          // Clear session storage
          if (typeof window !== "undefined") {
            sessionStorage.removeItem("cmux_auth_return_path");
            sessionStorage.removeItem("cmux_auth_repo");
            sessionStorage.removeItem("cmux_auth_pr");
          }

          // Automatically redirect after a short delay
          setTimeout(() => {
            router.push(state.returnPath || "/");
          }, 2000);
        } else if (setupAction === "cancel") {
          throw new Error("GitHub App installation was cancelled");
        } else {
          throw new Error(`Unexpected setup action: ${setupAction}`);
        }
      } catch (err) {
        console.error("GitHub callback error:", err);
        setStatus("error");
        setError(err instanceof Error ? err.message : "An unexpected error occurred");
      }
    };

    processCallback();
  }, [searchParams, router]);

  return (
    <div className="min-h-dvh bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-lg">
        <div className="p-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold">
            {status === "processing" && (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                Setting up GitHub Access
              </>
            )}
            {status === "success" && (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Successfully Connected
              </>
            )}
            {status === "error" && (
              <>
                <XCircle className="h-5 w-5 text-red-600" />
                Connection Failed
              </>
            )}
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            {status === "processing" && "Verifying your GitHub App installation..."}
            {status === "success" && "Your repository has been connected successfully!"}
            {status === "error" && "There was a problem connecting your repository."}
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          {status === "processing" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Verifying installation...
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Checking repository access...
              </div>
              <div className="flex items-center gap-2 text-sm text-neutral-600">
                <Loader2 className="h-3 w-3 animate-spin" />
                Configuring permissions...
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="space-y-4">
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-green-800">
                  The cmux-agent has been successfully installed and configured for your repository.
                  Redirecting you back to the PR review...
                </p>
              </div>
            </div>
          )}

          {status === "error" && error && (
            <div className="space-y-4">
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 flex items-start gap-2">
                <XCircle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                <p className="text-sm text-red-800">{error}</p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => router.push("/")}
                  className="flex-1"
                >
                  Go to Dashboard
                </Button>
                <Button
                  onClick={() => {
                    // Retry the installation
                    window.location.href = `https://github.com/apps/cmux-agent/installations/new`;
                  }}
                  className="flex-1"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {status === "success" && (
            <div className="flex justify-center">
              <Button onClick={() => router.push(returnPath)} className="gap-2">
                Continue to PR Review
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}