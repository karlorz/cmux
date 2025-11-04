# PostHog Analytics Implementation for apps/www

## Overview

This document describes the PostHog analytics tracking implementation added to the cmux `apps/www` application.

## Setup

### Dependencies

- **posthog-node**: Installed for server-side event tracking

### Environment Variables

Added `POSTHOG_API_KEY` (optional) to `apps/www/lib/utils/www-env.ts`:
- Set this environment variable to enable PostHog tracking
- If not set, tracking calls will be silently skipped

### Core Tracking Utility

**File**: `apps/www/lib/utils/posthog.ts`

This utility provides:
- A singleton PostHog client instance
- Generic `trackEvent()` function
- Specialized tracking functions for specific events
- Error handling that never breaks the application
- Automatic event flushing for reliability

## Events Being Tracked

### 1. **Sandbox Creation** (`sandbox_created`)

**Triggered**: When a Morph sandbox is created or started from an environment

**Location**: `apps/www/lib/routes/sandboxes.route.ts:329-343`

**Properties**:
- `sandboxId`: Morph instance ID
- `teamId`: Team UUID
- `userId`: User ID
- `sandboxType`: "morph" or "environment"
- `environmentId`: Environment ID (if applicable)
- `morphInstanceId`: Morph cloud instance ID
- `ttlMinutes`: Sandbox TTL in minutes
- `hasDevScript`: Whether dev script is configured
- `hasMaintenanceScript`: Whether maintenance script is configured
- `repoCount`: Number of repos hydrated

**Use cases**:
- Track sandbox usage patterns
- Understand environment vs direct morph usage
- Monitor resource allocation

---

### 2. **Environment Creation** (`environment_created`)

**Triggered**: When a new environment is created from a Morph snapshot

**Location**: `apps/www/lib/routes/environments.route.ts:281-295`

**Properties**:
- `environmentId`: Environment ID
- `teamId`: Team UUID
- `userId`: User ID
- `environmentName`: Environment name
- `morphSnapshotId`: Snapshot ID
- `morphInstanceId`: Source instance ID
- `hasEnvVars`: Whether environment variables are configured
- `exposedPortsCount`: Number of exposed ports
- `hasDevScript`: Whether dev script is configured
- `hasMaintenanceScript`: Whether maintenance script is configured

**Use cases**:
- Track environment creation frequency
- Understand which teams create environments
- Monitor environment configuration patterns

---

### 3. **Environment Snapshot Creation** (`environment_snapshot_created`)

**Triggered**: When a new snapshot version is created for an environment

**Location**: `apps/www/lib/routes/environments.route.ts:920-933`

**Properties**:
- `environmentId`: Environment ID
- `teamId`: Team UUID
- `userId`: User ID
- `snapshotVersion`: Version number
- `morphSnapshotId`: Morph snapshot ID
- `isActivated`: Whether this snapshot was immediately activated

**Use cases**:
- Track snapshot versioning usage
- Understand update frequency
- Monitor environment evolution

---

### 4. **Environment Deletion** (`environment_deleted`)

**Triggered**: When an environment is deleted

**Location**: `apps/www/lib/routes/environments.route.ts:1097-1105`

**Properties**:
- `environmentId`: Environment ID
- `teamId`: Team UUID
- `userId`: User ID
- `snapshotVersions`: Number of snapshot versions that existed

**Use cases**:
- Track environment lifecycle
- Understand cleanup patterns
- Monitor churn

---

### 5. **Model Usage** (`model_usage`)

**Triggered**: When LLM API calls are made through the Anthropic proxy

**Location**: `apps/www/app/api/anthropic/v1/messages/route.ts` (lines 130-142, 148-163, 170-182)

**Properties**:
- `model`: Model identifier (e.g., "claude-3-5-sonnet-20241022")
- `provider`: "anthropic", "openai", or "google"
- `teamId`: Team UUID (if authenticated)
- `userId`: User ID (if authenticated)
- `taskRunId`: Task run ID (if applicable)
- `inputTokens`: Number of input tokens
- `outputTokens`: Number of output tokens
- `totalTokens`: Total token count
- `streaming`: Whether response was streamed
- `responseTimeMs`: Response time in milliseconds
- `success`: Whether call succeeded
- `errorType`: Error type (if failed)

**Use cases**:
- Track LLM usage and costs
- Monitor model performance
- Understand usage patterns per team
- Identify errors and failures

---

### 6. **Code Review Started** (`code_review_started`)

**Triggered**: When a code review job is initiated

**Location**: `apps/www/lib/services/code-review/start-code-review.ts:249-262`

**Properties**:
- `jobId`: Job ID
- `teamId`: Team UUID or "anonymous"
- `userId`: User ID
- `reviewType`: "pr" or "comparison"
- `repoFullName`: Repository full name (owner/repo)
- `prNumber`: PR number (if PR review)
- `comparison`: Comparison string (if comparison review)
- `filesCount`: Number of files to review (optional)

**Use cases**:
- Track code review usage
- Monitor review types
- Understand team engagement

---

### 7. **Code Review Completed** (`code_review_completed`)

**Triggered**: When a code review job completes (success or failure)

**Location**: Not yet implemented - available in utility for future use

**Properties**:
- `jobId`: Job ID
- `teamId`: Team UUID
- `userId`: User ID
- `success`: Whether review completed successfully
- `durationMs`: Duration in milliseconds
- `errorType`: Error type (if failed)
- `filesReviewed`: Number of files reviewed

---

## Additional Tracking Functions Available

The following tracking functions are defined in `posthog.ts` but not yet used:

1. **`trackSandboxStopped`**: Track when sandboxes are stopped/paused
2. **`trackRepoConnected`**: Track GitHub repository connections
3. **`trackCodeReviewCompleted`**: Track code review completion (mentioned above)

## Implementation Details

### Error Handling

All tracking calls use `.catch()` to handle errors gracefully:
```typescript
trackEvent(...).catch((error) => {
  console.error("[component] Failed to track event", error);
});
```

This ensures tracking failures never disrupt the user experience.

### Performance

- PostHog client uses `flushAt: 1` and `flushInterval: 0` for immediate flushing
- Each tracking call explicitly calls `flush()` to ensure events are sent
- Tracking is done asynchronously and never blocks the response

### Privacy

- All tracking is server-side only
- No client-side tracking is implemented
- User IDs and team IDs are pseudonymous identifiers
- No PII is tracked beyond what's necessary for analytics

## Configuration

### Enabling PostHog

1. Set the `POSTHOG_API_KEY` environment variable in your `.env` file
2. Events will be sent to `https://us.i.posthog.com` (US region)
3. If the API key is not set, tracking is silently disabled

### Testing

PostHog tracking can be tested by:
1. Setting up a PostHog project
2. Adding the API key to `.env`
3. Running operations that trigger events
4. Checking the PostHog dashboard for incoming events

## Recommended Dashboards

### Sandbox Usage
- Sandboxes created over time (by type)
- Average TTL by team
- Environment vs direct morph usage
- Repo count distribution

### Environment Management
- Environments created/deleted over time
- Snapshot versions per environment
- Port exposure patterns
- Script configuration usage

### Model Usage
- Token consumption by model
- Cost estimation by team
- Response time distribution
- Error rates by error type
- Streaming vs non-streaming usage

### Code Review
- Reviews started vs completed
- Review duration distribution
- Success rate
- PR reviews vs comparisons

## Future Enhancements

1. Add tracking for sandbox stop events
2. Track code review completion with success/failure
3. Add tracking for GitHub repository connections
4. Track port exposure changes
5. Track environment variable updates
6. Add custom properties for A/B testing
7. Track user onboarding flows
8. Monitor feature adoption rates
