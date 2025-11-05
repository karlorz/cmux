import { useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { WelcomeStep } from "./steps/WelcomeStep";
import { GitHubConnectionStep } from "./steps/GitHubConnectionStep";
import { EnvironmentExplanationStep } from "./steps/EnvironmentExplanationStep";
import { QuickStartStep } from "./steps/QuickStartStep";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export type OnboardingStep = "welcome" | "github" | "environments" | "quickstart";

interface OnboardingModalProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingModal({ open, onComplete }: OnboardingModalProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>("welcome");
  const [hasConnectedGitHub, setHasConnectedGitHub] = useState(false);
  const [selectedRepos, setSelectedRepos] = useState<string[]>([]);

  const steps: OnboardingStep[] = ["welcome", "github", "environments", "quickstart"];
  const currentStepIndex = steps.indexOf(currentStep);
  const progress = ((currentStepIndex + 1) / steps.length) * 100;

  const canProceed = () => {
    switch (currentStep) {
      case "welcome":
        return true;
      case "github":
        return hasConnectedGitHub && selectedRepos.length > 0;
      case "environments":
        return true;
      case "quickstart":
        return true;
      default:
        return false;
    }
  };

  const handleNext = () => {
    if (currentStep === "quickstart") {
      onComplete();
    } else {
      const nextIndex = currentStepIndex + 1;
      if (nextIndex < steps.length) {
        setCurrentStep(steps[nextIndex]);
      }
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex]);
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case "welcome":
        return <WelcomeStep />;
      case "github":
        return (
          <GitHubConnectionStep
            hasConnected={hasConnectedGitHub}
            onConnectionChange={setHasConnectedGitHub}
            selectedRepos={selectedRepos}
            onReposChange={setSelectedRepos}
          />
        );
      case "environments":
        return <EnvironmentExplanationStep />;
      case "quickstart":
        return <QuickStartStep selectedRepos={selectedRepos} />;
      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome to cmux</DialogTitle>

        {/* Progress bar */}
        <div className="px-8 pt-6 pb-4 border-b border-border">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-medium text-muted-foreground">
              Step {currentStepIndex + 1} of {steps.length}
            </h2>
            <span className="text-xs text-muted-foreground">
              {Math.round(progress)}% complete
            </span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-8 py-6">
          <div
            key={currentStep}
            className="animate-in fade-in-0 slide-in-from-bottom-4 duration-300"
          >
            {renderStep()}
          </div>
        </div>

        {/* Footer with navigation */}
        <div className="px-8 py-4 border-t border-border flex items-center justify-between bg-muted/20">
          <Button
            variant="ghost"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {steps.map((step, index) => (
              <div
                key={step}
                className={cn(
                  "w-2 h-2 rounded-full transition-all",
                  index === currentStepIndex
                    ? "bg-primary w-8"
                    : index < currentStepIndex
                    ? "bg-primary/60"
                    : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          <Button
            onClick={handleNext}
            disabled={!canProceed()}
            className="gap-2"
          >
            {currentStep === "quickstart" ? "Get Started" : "Next"}
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
