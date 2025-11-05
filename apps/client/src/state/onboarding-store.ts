import { useSyncExternalStore } from "react";

export interface OnboardingState {
  hasCompletedOnboarding: boolean;
  hasSeenWelcome: boolean;
  hasConnectedGitHub: boolean;
  hasCreatedEnvironment: boolean;
}

const STORAGE_KEY = "cmux_onboarding_state";

class OnboardingStore {
  private listeners = new Set<() => void>();
  private state: OnboardingState;

  constructor() {
    // Load from localStorage
    const stored = localStorage.getItem(STORAGE_KEY);
    this.state = stored
      ? JSON.parse(stored)
      : {
          hasCompletedOnboarding: false,
          hasSeenWelcome: false,
          hasConnectedGitHub: false,
          hasCreatedEnvironment: false,
        };
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = () => {
    return this.state;
  };

  private emit() {
    // Save to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));

    // Notify listeners
    for (const listener of this.listeners) {
      listener();
    }
  }

  completeOnboarding() {
    this.state = {
      ...this.state,
      hasCompletedOnboarding: true,
      hasSeenWelcome: true,
    };
    this.emit();
  }

  markWelcomeSeen() {
    this.state = { ...this.state, hasSeenWelcome: true };
    this.emit();
  }

  markGitHubConnected() {
    this.state = { ...this.state, hasConnectedGitHub: true };
    this.emit();
  }

  markEnvironmentCreated() {
    this.state = { ...this.state, hasCreatedEnvironment: true };
    this.emit();
  }

  reset() {
    this.state = {
      hasCompletedOnboarding: false,
      hasSeenWelcome: false,
      hasConnectedGitHub: false,
      hasCreatedEnvironment: false,
    };
    this.emit();
  }

  shouldShowOnboarding(): boolean {
    return !this.state.hasCompletedOnboarding;
  }
}

export const onboardingStore = new OnboardingStore();

export function useOnboardingStore() {
  return useSyncExternalStore(
    onboardingStore.subscribe,
    onboardingStore.getSnapshot,
    onboardingStore.getSnapshot
  );
}
