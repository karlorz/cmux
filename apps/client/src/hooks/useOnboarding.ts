import { useEffect, useState } from "react";
import { useUser } from "@stackframe/react";
import { api } from "@cmux/convex/api";
import { useQuery } from "convex/react";
import {
  getOnboardingState,
  shouldShowOnboarding,
  isOnboardingDismissed,
} from "@/lib/onboarding";

interface UseOnboardingOptions {
  teamSlugOrId?: string;
  disabled?: boolean;
}

export function useOnboarding({ teamSlugOrId, disabled }: UseOnboardingOptions = {}) {
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);

  const user = useUser({ or: "return-null" });
  const teams = user?.useTeams() ?? [];

  // Check GitHub connections
  const providerConnections = useQuery(
    api.github.listProviderConnections,
    teamSlugOrId && !disabled ? { teamSlugOrId } : "skip"
  );

  const hasTeams = teams.length > 0;
  const hasGitHubConnection = (providerConnections?.length ?? 0) > 0;

  useEffect(() => {
    if (disabled || hasChecked || isOnboardingDismissed()) {
      return;
    }

    // Add a small delay to avoid flash of onboarding on page load
    const timer = setTimeout(() => {
      const shouldShow = shouldShowOnboarding(hasTeams, hasGitHubConnection);

      if (shouldShow) {
        setIsOnboardingOpen(true);
      }
      setHasChecked(true);
    }, 1000);

    return () => clearTimeout(timer);
  }, [hasTeams, hasGitHubConnection, hasChecked, disabled]);

  const openOnboarding = () => {
    setIsOnboardingOpen(true);
  };

  const closeOnboarding = () => {
    setIsOnboardingOpen(false);
  };

  const onboardingState = getOnboardingState();

  return {
    isOnboardingOpen,
    openOnboarding,
    closeOnboarding,
    onboardingState,
    hasTeams,
    hasGitHubConnection,
  };
}