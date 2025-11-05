import * as Dialog from "@radix-ui/react-dialog";
import { Check, Github, Sparkles, FolderGit2, Box } from "lucide-react";
import { useState, useCallback, useEffect } from "react";
import { api } from "@cmux/convex/api";
import { useMutation, useQuery } from "convex/react";
import { WelcomeStep } from "./steps/WelcomeStep";
import { GitHubConnectStep } from "./steps/GitHubConnectStep";
import { RepositorySyncStep } from "./steps/RepositorySyncStep";
import { EnvironmentsExplanationStep } from "./steps/EnvironmentsExplanationStep";
import { CompleteStep } from "./steps/CompleteStep";

export type OnboardingStep = "welcome" | "github" | "repos" | "environments" | "complete";

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  teamSlugOrId: string;
}

const STEP_ORDER: OnboardingStep[] = [
  "welcome",
  "github",
  "repos",
  "environments",
  "complete",
];

function getStepIndex(step: OnboardingStep): number {
  return STEP_ORDER.indexOf(step);
}

function getStepIcon(step: OnboardingStep) {
  switch (step) {
    case "welcome":
      return Sparkles;
    case "github":
      return Github;
    case "repos":
      return FolderGit2;
    case "environments":
      return Box;
    case "complete":
      return Check;
  }
}

function getStepTitle(step: OnboardingStep): string {
  switch (step) {
    case "welcome":
      return "Welcome";
    case "github":
      return "Connect GitHub";
    case "repos":
      return "Sync Repositories";
    case "environments":
      return "Environments";
    case "complete":
      return "All Set!";
  }
}

export function OnboardingWizard({
  open,
  onComplete,
  teamSlugOrId,
}: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(
    new Set()
  );

  const updateOnboardingStep = useMutation(api.onboarding.updateOnboardingStep);
  const completeOnboarding = useMutation(api.onboarding.completeOnboarding);
  const onboardingState = useQuery(api.onboarding.getOnboardingState);

  // Track connected GitHub accounts
  const [hasGitHubConnection, setHasGitHubConnection] = useState(false);
  // Track selected repositories
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  useEffect(() => {
    if (open && onboardingState?.onboardingStep) {
      const step = onboardingState.onboardingStep as OnboardingStep;
      if (STEP_ORDER.includes(step)) {
        setCurrentStep(step);
      }
    }
  }, [open, onboardingState]);

  const handleNext = useCallback(async () => {
    const currentIndex = getStepIndex(currentStep);
    if (currentIndex < STEP_ORDER.length - 1) {
      const nextStep = STEP_ORDER[currentIndex + 1];
      setCompletedSteps((prev) => new Set([...prev, currentStep]));
      setCurrentStep(nextStep);
      await updateOnboardingStep({ step: nextStep });
    }
  }, [currentStep, updateOnboardingStep]);

  const handleSkip = useCallback(async () => {
    await handleNext();
  }, [handleNext]);

  const handleComplete = useCallback(async () => {
    await completeOnboarding({});
    onComplete();
  }, [completeOnboarding, onComplete]);

  const handleGitHubConnected = useCallback(() => {
    setHasGitHubConnection(true);
  }, []);

  const handleReposSelected = useCallback((repos: string[]) => {
    setSelectedRepos(repos);
  }, []);

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep onNext={handleNext} />;
      case "github":
        return (
          <GitHubConnectStep
            teamSlugOrId={teamSlugOrId}
            onNext={handleNext}
            onSkip={handleSkip}
            onGitHubConnected={handleGitHubConnected}
            hasConnection={hasGitHubConnection}
          />
        );
      case "repos":
        return (
          <RepositorySyncStep
            teamSlugOrId={teamSlugOrId}
            onNext={handleNext}
            onSkip={handleSkip}
            onReposSelected={handleReposSelected}
            selectedRepos={selectedRepos}
            hasGitHubConnection={hasGitHubConnection}
          />
        );
      case "environments":
        return (
          <EnvironmentsExplanationStep
            onNext={handleNext}
            teamSlugOrId={teamSlugOrId}
          />
        );
      case "complete":
        return (
          <CompleteStep
            onComplete={handleComplete}
            teamSlugOrId={teamSlugOrId}
            hasGitHubConnection={hasGitHubConnection}
            repoCount={selectedRepos.length}
          />
        );
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={() => {}}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-neutral-950/80 backdrop-blur-sm" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-200 bg-white shadow-2xl focus:outline-none dark:border-neutral-800 dark:bg-neutral-900"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          {/* Progress indicator */}
          <div className="border-b border-neutral-200 px-8 py-6 dark:border-neutral-800">
            <div className="flex items-center justify-between">
              {STEP_ORDER.map((step, index) => {
                const StepIcon = getStepIcon(step);
                const isActive = step === currentStep;
                const isCompleted = completedSteps.has(step);
                const isFuture = getStepIndex(step) > getStepIndex(currentStep);

                return (
                  <div key={step} className="flex flex-1 items-center">
                    <div className="flex flex-col items-center gap-2">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all ${
                          isActive
                            ? "border-primary bg-primary text-white shadow-lg shadow-primary/20"
                            : isCompleted
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-neutral-300 bg-neutral-100 text-neutral-400 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-600"
                        }`}
                      >
                        {isCompleted ? (
                          <Check className="h-5 w-5" />
                        ) : (
                          <StepIcon className="h-5 w-5" />
                        )}
                      </div>
                      <span
                        className={`text-xs font-medium ${
                          isActive
                            ? "text-neutral-900 dark:text-neutral-100"
                            : isFuture
                              ? "text-neutral-400 dark:text-neutral-600"
                              : "text-neutral-600 dark:text-neutral-400"
                        }`}
                      >
                        {getStepTitle(step)}
                      </span>
                    </div>
                    {index < STEP_ORDER.length - 1 && (
                      <div
                        className={`mx-2 h-0.5 flex-1 transition-all ${
                          completedSteps.has(step)
                            ? "bg-primary"
                            : "bg-neutral-200 dark:bg-neutral-700"
                        }`}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Step content */}
          <div className="px-8 py-8">
            {renderStep()}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
