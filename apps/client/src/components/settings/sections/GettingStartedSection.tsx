import { useOnboardingOptional } from "@/contexts/onboarding";
import { useNavigate } from "@tanstack/react-router";
import { HelpCircle } from "lucide-react";
import { useCallback } from "react";
import { SettingSection } from "@/components/settings/SettingSection";

interface GettingStartedSectionProps {
  teamSlugOrId: string;
}

export function GettingStartedSection({
  teamSlugOrId,
}: GettingStartedSectionProps) {
  const onboarding = useOnboardingOptional();
  const navigate = useNavigate();

  const handleStartTour = useCallback(async () => {
    if (!onboarding) return;
    onboarding.resetOnboarding();

    try {
      await navigate({
        to: "/$teamSlugOrId/dashboard",
        params: { teamSlugOrId },
      });
    } catch (error) {
      console.error("Failed to navigate to dashboard for onboarding:", error);
      return;
    }

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 100);
    });
    onboarding.startOnboarding();
  }, [navigate, onboarding, teamSlugOrId]);

  return (
    <SettingSection title="Getting Started">
      <div className="px-4 py-3">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
              <HelpCircle className="w-4.5 h-4.5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
                Product Tour
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
                Take a guided tour of cmux to learn about its features and how to
                get the most out of it.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleStartTour}
            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-md transition-colors flex-shrink-0"
          >
            Start Tour
          </button>
        </div>
      </div>
    </SettingSection>
  );
}
