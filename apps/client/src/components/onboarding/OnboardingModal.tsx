"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  ChevronLeft,
  Code2,
  GitBranch,
  Github,
  Layers3,
  Rocket,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  completeOnboardingStep,
  dismissOnboardingTemporarily,
  getOnboardingProgress,
  getOnboardingState,
  OnboardingStep,
  skipOnboarding,
  type OnboardingState,
} from "@/lib/onboarding";
import { useNavigate } from "@tanstack/react-router";
import { WelcomeStep } from "./steps/WelcomeStep";
import { TeamSetupStep } from "./steps/TeamSetupStep";
import { GitHubConnectionStep } from "./steps/GitHubConnectionStep";
import { RepoSelectionStep } from "./steps/RepoSelectionStep";
import { EnvironmentIntroStep } from "./steps/EnvironmentIntroStep";
import { CompleteStep } from "./steps/CompleteStep";

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  teamSlugOrId?: string;
  onComplete?: () => void;
}

const stepIcons: Record<OnboardingStep, React.ReactNode> = {
  [OnboardingStep.Welcome]: <Sparkles className="h-5 w-5" />,
  [OnboardingStep.TeamSetup]: <Users className="h-5 w-5" />,
  [OnboardingStep.GitHubConnection]: <Github className="h-5 w-5" />,
  [OnboardingStep.RepoSelection]: <GitBranch className="h-5 w-5" />,
  [OnboardingStep.EnvironmentIntro]: <Layers3 className="h-5 w-5" />,
  [OnboardingStep.FirstTask]: <Code2 className="h-5 w-5" />,
  [OnboardingStep.Complete]: <Rocket className="h-5 w-5" />,
};

const stepTitles: Record<OnboardingStep, string> = {
  [OnboardingStep.Welcome]: "Welcome to cmux",
  [OnboardingStep.TeamSetup]: "Set Up Your Team",
  [OnboardingStep.GitHubConnection]: "Connect GitHub",
  [OnboardingStep.RepoSelection]: "Select Repositories",
  [OnboardingStep.EnvironmentIntro]: "Understanding Environments",
  [OnboardingStep.FirstTask]: "Create Your First Task",
  [OnboardingStep.Complete]: "You're All Set!",
};

export function OnboardingModal({
  isOpen,
  onClose,
  teamSlugOrId,
  onComplete,
}: OnboardingModalProps) {
  const navigate = useNavigate();
  const [state, setState] = useState<OnboardingState>(getOnboardingState());
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    // Refresh state when modal opens
    if (isOpen) {
      setState(getOnboardingState());
    }
  }, [isOpen]);

  const handleNext = useCallback(() => {
    setIsTransitioning(true);
    completeOnboardingStep(state.currentStep);
    const newState = getOnboardingState();

    setTimeout(() => {
      setState(newState);
      setIsTransitioning(false);
    }, 300);

    if (newState.hasCompletedOnboarding && onComplete) {
      setTimeout(() => {
        onComplete();
      }, 500);
    }
  }, [state.currentStep, onComplete]);

  const handleBack = useCallback(() => {
    const steps = Object.values(OnboardingStep);
    const currentIndex = steps.indexOf(state.currentStep);
    if (currentIndex > 0) {
      setIsTransitioning(true);
      const prevStep = steps[currentIndex - 1];
      setState(prev => ({ ...prev, currentStep: prevStep }));
      setTimeout(() => setIsTransitioning(false), 300);
    }
  }, [state.currentStep]);

  const handleSkip = useCallback(() => {
    skipOnboarding();
    onClose();
    if (onComplete) {
      onComplete();
    }
  }, [onClose, onComplete]);

  const handleDismiss = useCallback(() => {
    dismissOnboardingTemporarily();
    onClose();
  }, [onClose]);

  const progress = getOnboardingProgress(state);
  const canGoBack = state.currentStep !== OnboardingStep.Welcome;
  const isLastStep = state.currentStep === OnboardingStep.Complete;

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
        onClick={handleDismiss}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="relative w-full max-w-3xl rounded-2xl bg-white dark:bg-neutral-900 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative border-b border-neutral-200 dark:border-neutral-800 px-8 py-6">
            {/* Progress bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-neutral-100 dark:bg-neutral-800">
              <motion.div
                className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 text-blue-600 dark:text-blue-400">
                  {stepIcons[state.currentStep]}
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-neutral-900 dark:text-neutral-100">
                    {stepTitles[state.currentStep]}
                  </h2>
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    Step {state.completedSteps.length + 1} of 5
                  </p>
                </div>
              </div>

              <button
                onClick={handleDismiss}
                className="rounded-lg p-2 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:hover:bg-neutral-800 dark:hover:text-neutral-300 transition-colors"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="relative min-h-[400px] max-h-[60vh] overflow-y-auto p-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={state.currentStep}
                initial={{ opacity: 0, x: isTransitioning ? 20 : 0 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: isTransitioning ? -20 : 0 }}
                transition={{ duration: 0.3 }}
              >
                {state.currentStep === OnboardingStep.Welcome && (
                  <WelcomeStep />
                )}
                {state.currentStep === OnboardingStep.TeamSetup && (
                  <TeamSetupStep teamSlugOrId={teamSlugOrId} />
                )}
                {state.currentStep === OnboardingStep.GitHubConnection && (
                  <GitHubConnectionStep teamSlugOrId={teamSlugOrId} />
                )}
                {state.currentStep === OnboardingStep.RepoSelection && (
                  <RepoSelectionStep teamSlugOrId={teamSlugOrId} />
                )}
                {state.currentStep === OnboardingStep.EnvironmentIntro && (
                  <EnvironmentIntroStep />
                )}
                {state.currentStep === OnboardingStep.Complete && (
                  <CompleteStep onGetStarted={() => {
                    onClose();
                    if (teamSlugOrId) {
                      void navigate({
                        to: "/$teamSlugOrId/dashboard",
                        params: { teamSlugOrId },
                      });
                    }
                  }} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="border-t border-neutral-200 dark:border-neutral-800 px-8 py-6">
            <div className="flex items-center justify-between">
              <div>
                {canGoBack && (
                  <Button
                    variant="ghost"
                    onClick={handleBack}
                    disabled={isTransitioning}
                    className="gap-2"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Back
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-3">
                {!isLastStep && (
                  <Button
                    variant="ghost"
                    onClick={handleSkip}
                    disabled={isTransitioning}
                    className="text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                  >
                    Skip tour
                  </Button>
                )}
                {!isLastStep && (
                  <Button
                    onClick={handleNext}
                    disabled={isTransitioning}
                    className="gap-2 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}