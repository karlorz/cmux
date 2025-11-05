import { Button } from "@/components/ui/button";
import { onboardingStore } from "@/state/onboarding-store";
import { Rocket } from "lucide-react";

interface OnboardingTriggerProps {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
  className?: string;
}

export function OnboardingTrigger({
  variant = "outline",
  size = "default",
  className,
}: OnboardingTriggerProps) {
  const handleClick = () => {
    onboardingStore.reset();
  };

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleClick}
      className={className}
    >
      <Rocket className="w-4 h-4 mr-2" />
      Start Onboarding
    </Button>
  );
}
