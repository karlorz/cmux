# cmux Onboarding System

## Overview

A comprehensive onboarding system has been implemented to guide new users through setting up cmux, including:
- Team creation/selection
- GitHub account connection
- Repository selection
- Environment understanding
- Getting started with first task

## Components

### 1. Onboarding Modal (`/apps/client/src/components/onboarding/OnboardingModal.tsx`)
Main modal component that orchestrates the onboarding flow with progress tracking and step navigation.

### 2. Onboarding Steps
- **WelcomeStep**: Introduction to cmux and its features
- **TeamSetupStep**: Create or select a team
- **GitHubConnectionStep**: Connect GitHub account via OAuth
- **RepoSelectionStep**: Select repositories to work with
- **EnvironmentIntroStep**: Learn about isolated environments and Docker containers
- **CompleteStep**: Congratulations and next steps

### 3. State Management (`/apps/client/src/lib/onboarding.ts`)
- Persistent state using localStorage
- Progress tracking
- Step completion management
- Skip and dismiss functionality

### 4. Onboarding Hook (`/apps/client/src/hooks/useOnboarding.ts`)
Custom React hook that:
- Detects new users (no teams, no GitHub connection)
- Manages onboarding modal visibility
- Handles session-based dismissal

## How It Works

### Automatic Detection
The onboarding automatically triggers for new users when:
1. User has no teams created
2. User has no GitHub connections
3. User hasn't completed or skipped onboarding

### Manual Trigger
To manually test the onboarding:
1. Clear localStorage: `localStorage.clear()`
2. Refresh the page
3. The onboarding will appear automatically

### Persistence
- Onboarding state is saved in localStorage
- Users can skip the onboarding at any time
- Progress is saved between sessions
- Temporary dismissal (X button) only hides for current session

## Features

### Beautiful UI
- Animated transitions using Framer Motion
- Progress bar showing completion status
- Step indicators with icons
- Responsive design with dark mode support
- Gradient backgrounds and modern styling

### User Experience
- Back/forward navigation between steps
- Skip option for experienced users
- Clear explanations for each step
- Visual feedback for completed actions
- Helpful tooltips and info boxes

### Integration Points
- Stack authentication for team management
- Convex for GitHub provider connections
- React Query for repository fetching
- Local storage for state persistence

## Testing

To test the onboarding flow:

1. **Reset onboarding state**:
```javascript
localStorage.removeItem('cmux_onboarding_state');
localStorage.removeItem('cmux_onboarding_dismissed');
```

2. **Navigate to dashboard** as a new user

3. **Follow the steps**:
   - Welcome screen introduction
   - Create/join a team
   - Connect GitHub account
   - Select repositories
   - Learn about environments
   - Complete onboarding

## Customization

### Adding New Steps
1. Create step component in `/apps/client/src/components/onboarding/steps/`
2. Add step to `OnboardingStep` enum in `/apps/client/src/lib/onboarding.ts`
3. Import and add step to `OnboardingModal.tsx`
4. Update step titles and icons

### Styling
- Tailwind classes for consistent theming
- Dark mode support throughout
- Gradient utilities for visual appeal
- Animation with Framer Motion

## Future Enhancements

Potential improvements:
- Analytics tracking for step completion
- A/B testing different onboarding flows
- Video tutorials embedded in steps
- Interactive demos within onboarding
- Personalized onboarding based on user type
- Email reminders for incomplete onboarding
- Onboarding completion rewards/badges