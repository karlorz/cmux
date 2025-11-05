import { type ReactNode } from "react";
import { OnboardingModal } from "./OnboardingModal";
import { useOnboarding } from "@/hooks/useOnboarding";

interface OnboardingProviderProps {
  children: ReactNode;
}

export function OnboardingProvider({ children }: OnboardingProviderProps) {
  const { isOpen, completeOnboarding } = useOnboarding();

  return (
    <>
      {children}
      <OnboardingModal open={isOpen} onComplete={completeOnboarding} />
    </>
  );
}
