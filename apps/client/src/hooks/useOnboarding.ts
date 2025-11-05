import { useState, useEffect } from "react";
import { useOnboardingStore, onboardingStore } from "@/state/onboarding-store";
import { useUser } from "@stackframe/react";

export function useOnboarding() {
  const state = useOnboardingStore();
  const user = useUser();
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Only show onboarding if user is logged in and hasn't completed it
    if (user && onboardingStore.shouldShowOnboarding()) {
      // Small delay to let the app load first
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [user]);

  const completeOnboarding = () => {
    onboardingStore.completeOnboarding();
    setIsOpen(false);
  };

  const skipOnboarding = () => {
    onboardingStore.completeOnboarding();
    setIsOpen(false);
  };

  const resetOnboarding = () => {
    onboardingStore.reset();
    setIsOpen(true);
  };

  return {
    isOpen,
    state,
    completeOnboarding,
    skipOnboarding,
    resetOnboarding,
    shouldShowOnboarding: onboardingStore.shouldShowOnboarding(),
  };
}
