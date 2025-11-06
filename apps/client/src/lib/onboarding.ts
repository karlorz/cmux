/**
 * Onboarding state management and utilities
 */

export interface OnboardingState {
  hasCompletedOnboarding: boolean;
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  skippedAt?: number;
  completedAt?: number;
  githubConnected: boolean;
  reposConnected: string[];
  hasViewedEnvironmentTutorial: boolean;
}

export enum OnboardingStep {
  Welcome = "welcome",
  TeamSetup = "team_setup",
  GitHubConnection = "github_connection",
  RepoSelection = "repo_selection",
  EnvironmentIntro = "environment_intro",
  FirstTask = "first_task",
  Complete = "complete",
}

const ONBOARDING_STORAGE_KEY = "cmux_onboarding_state";
const ONBOARDING_DISMISSED_KEY = "cmux_onboarding_dismissed";

export function getOnboardingState(): OnboardingState {
  try {
    const stored = localStorage.getItem(ONBOARDING_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as OnboardingState;
    }
  } catch (error) {
    console.error("[Onboarding] Failed to read state:", error);
  }

  // Default state for new users
  return {
    hasCompletedOnboarding: false,
    currentStep: OnboardingStep.Welcome,
    completedSteps: [],
    githubConnected: false,
    reposConnected: [],
    hasViewedEnvironmentTutorial: false,
  };
}

export function saveOnboardingState(state: Partial<OnboardingState>): void {
  try {
    const current = getOnboardingState();
    const updated = { ...current, ...state };
    localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error("[Onboarding] Failed to save state:", error);
  }
}

export function completeOnboardingStep(step: OnboardingStep): void {
  const state = getOnboardingState();
  if (!state.completedSteps.includes(step)) {
    state.completedSteps.push(step);
  }

  // Move to next step
  const steps = Object.values(OnboardingStep);
  const currentIndex = steps.indexOf(step);
  if (currentIndex < steps.length - 1) {
    state.currentStep = steps[currentIndex + 1];
  }

  // Check if all steps are complete
  const requiredSteps = [
    OnboardingStep.Welcome,
    OnboardingStep.TeamSetup,
    OnboardingStep.GitHubConnection,
    OnboardingStep.RepoSelection,
    OnboardingStep.EnvironmentIntro,
  ];

  if (requiredSteps.every(s => state.completedSteps.includes(s))) {
    state.hasCompletedOnboarding = true;
    state.completedAt = Date.now();
    state.currentStep = OnboardingStep.Complete;
  }

  saveOnboardingState(state);
}

export function skipOnboarding(): void {
  const state = getOnboardingState();
  state.hasCompletedOnboarding = true;
  state.skippedAt = Date.now();
  state.currentStep = OnboardingStep.Complete;
  saveOnboardingState(state);
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_STORAGE_KEY);
  localStorage.removeItem(ONBOARDING_DISMISSED_KEY);
}

export function dismissOnboardingTemporarily(): void {
  sessionStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
}

export function isOnboardingDismissed(): boolean {
  return sessionStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
}

export function shouldShowOnboarding(
  hasTeams: boolean,
  hasGitHubConnection: boolean,
): boolean {
  // Don't show if temporarily dismissed this session
  if (isOnboardingDismissed()) {
    return false;
  }

  const state = getOnboardingState();

  // Already completed
  if (state.hasCompletedOnboarding) {
    return false;
  }

  // New user detection: no teams and no GitHub connection
  if (!hasTeams && !hasGitHubConnection) {
    return true;
  }

  // User has started but not completed onboarding
  if (state.currentStep !== OnboardingStep.Complete && state.completedSteps.length > 0) {
    return true;
  }

  return false;
}

export function getNextOnboardingStep(state: OnboardingState): OnboardingStep | null {
  const steps = Object.values(OnboardingStep);
  const currentIndex = steps.indexOf(state.currentStep);

  if (currentIndex < steps.length - 1) {
    return steps[currentIndex + 1];
  }

  return null;
}

export function getOnboardingProgress(state: OnboardingState): number {
  const requiredSteps = [
    OnboardingStep.Welcome,
    OnboardingStep.TeamSetup,
    OnboardingStep.GitHubConnection,
    OnboardingStep.RepoSelection,
    OnboardingStep.EnvironmentIntro,
  ];

  const completed = requiredSteps.filter(s => state.completedSteps.includes(s)).length;
  return (completed / requiredSteps.length) * 100;
}