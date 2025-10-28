"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Lock, ExternalLink, Github, CheckCircle2, Circle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PrivateRepoAuthProps {
  teamSlugOrId: string;
  githubOwner: string;
  repo: string;
  pullNumber: number;
  returnPath: string;
}

type SetupStep = {
  id: string;
  title: string;
  description: string;
  completed: boolean;
};

export function PrivateRepoAuth({
  teamSlugOrId,
  githubOwner,
  repo,
  pullNumber,
  returnPath,
}: PrivateRepoAuthProps) {
  const router = useRouter();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [currentStep, setCurrentStep] = useState<number>(0);

  const setupSteps: SetupStep[] = [
    {
      id: "github-auth",
      title: "Authenticate with GitHub",
      description: "Sign in with your GitHub account to access private repositories",
      completed: currentStep > 0,
    },
    {
      id: "install-app",
      title: "Install cmux-agent",
      description: "Install the cmux GitHub App in your repository",
      completed: currentStep > 1,
    },
    {
      id: "configure-repo",
      title: "Configure Repository",
      description: "Grant access to the specific repository",
      completed: currentStep > 2,
    },
  ];

  const handleGitHubAuth = async () => {
    setIsAuthenticating(true);

    // Store the return URL in session storage for after auth
    if (typeof window !== "undefined") {
      sessionStorage.setItem("cmux_auth_return_path", returnPath);
      sessionStorage.setItem("cmux_auth_repo", `${githubOwner}/${repo}`);
      sessionStorage.setItem("cmux_auth_pr", pullNumber.toString());
    }

    // Construct GitHub App installation URL
    // This URL should point to your GitHub App installation page
    const githubAppInstallUrl = `https://github.com/apps/cmux-agent/installations/new?state=${encodeURIComponent(
      JSON.stringify({
        teamId: teamSlugOrId,
        returnPath: returnPath,
        repository: `${githubOwner}/${repo}`,
        pullRequest: pullNumber,
      })
    )}`;

    // Redirect to GitHub App installation
    window.location.href = githubAppInstallUrl;
  };

  const handleContinue = () => {
    setCurrentStep(1);
    handleGitHubAuth();
  };

  return (
    <div className="min-h-dvh bg-neutral-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl space-y-6">
        {/* Main Card */}
        <div className="rounded-xl border border-neutral-200 bg-white shadow-lg">
          <div className="p-6 space-y-1 pb-6">
            <div className="flex items-center gap-2 text-amber-600 mb-2">
              <Lock className="h-5 w-5" />
              <span className="text-sm font-medium">Private Repository</span>
            </div>
            <h2 className="text-2xl font-semibold">Authentication Required</h2>
            <p className="text-base text-neutral-600">
              <span className="font-mono text-neutral-900">{githubOwner}/{repo}</span> is a private repository.
              To review pull request #{pullNumber}, you need to authenticate with GitHub and install the cmux-agent.
            </p>
          </div>

          <div className="px-6 pb-6 space-y-6">
            {/* Info Alert */}
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <h3 className="font-semibold text-blue-900">Why is this needed?</h3>
              <div className="text-blue-800 mt-2 space-y-2">
                <p>
                  The cmux-agent GitHub App allows us to securely access your private repository
                  to perform code reviews while maintaining your repository&apos;s privacy.
                </p>
                <p className="text-sm">
                  • Your code remains private and secure
                  <br />
                  • Access can be revoked at any time
                  <br />
                  • Only the repositories you explicitly grant access to will be accessible
                </p>
              </div>
            </div>

            {/* Setup Steps */}
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-neutral-700">Setup Steps</h3>
              <div className="space-y-2">
                {setupSteps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border ${
                      step.completed
                        ? "bg-green-50 border-green-200"
                        : index === currentStep
                        ? "bg-blue-50 border-blue-200"
                        : "bg-neutral-50 border-neutral-200"
                    }`}
                  >
                    <div className="mt-0.5">
                      {step.completed ? (
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                      ) : (
                        <Circle className="h-5 w-5 text-neutral-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`font-medium text-sm ${
                          step.completed
                            ? "text-green-900"
                            : index === currentStep
                            ? "text-blue-900"
                            : "text-neutral-700"
                        }`}
                      >
                        {step.title}
                      </p>
                      <p
                        className={`text-xs mt-0.5 ${
                          step.completed
                            ? "text-green-700"
                            : index === currentStep
                            ? "text-blue-700"
                            : "text-neutral-500"
                        }`}
                      >
                        {step.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GitHub App Benefits */}
            <div className="bg-neutral-50 rounded-lg p-4 space-y-2">
              <h4 className="text-sm font-semibold text-neutral-700">What you&apos;ll get:</h4>
              <ul className="text-sm text-neutral-600 space-y-1">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Automated PR reviews with AI-powered insights
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Security vulnerability detection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Code quality and best practice suggestions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-600 flex-shrink-0" />
                  Performance optimization recommendations
                </li>
              </ul>
            </div>
          </div>

          <div className="flex gap-3 p-6 pt-0">
            <Button
              variant="outline"
              onClick={() => router.push("/")}
              disabled={isAuthenticating}
            >
              Cancel
            </Button>
            <Button
              onClick={handleContinue}
              disabled={isAuthenticating}
              className="flex-1 gap-2"
            >
              {isAuthenticating ? (
                <>
                  <span className="animate-pulse">Redirecting to GitHub...</span>
                </>
              ) : (
                <>
                  <Github className="h-4 w-4" />
                  Continue with GitHub
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Help Card */}
        <div className="rounded-lg bg-neutral-50 border border-neutral-200 p-4">
          <h3 className="text-sm font-semibold mb-3">Need help?</h3>
          <div className="space-y-2 text-sm">
            <a
              href="https://docs.cmux.ai/github-app"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:underline"
            >
              Read our GitHub App documentation
              <ExternalLink className="h-3 w-3" />
            </a>
            <a
              href="https://github.com/apps/cmux-agent"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-blue-600 hover:text-blue-700 hover:underline"
            >
              View cmux-agent on GitHub Marketplace
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}