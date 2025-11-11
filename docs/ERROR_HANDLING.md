# Graceful Error Handling for Configuration and External Services

This document describes the error handling improvements added to cmux to handle failures in external services (like Stack Auth) and configuration loading more gracefully.

## Overview

The application now includes comprehensive error handling for:

1. **Stack Auth initialization failures**
2. **DataVault operation failures**
3. **Environment variable loading failures**
4. **External service timeouts and retries**

## Architecture

### 1. Stack Auth with Fallback

**Location**: `apps/www/lib/utils/stack-with-fallback.ts`

Stack Auth instances are now created with error handling:

```typescript
import {
  stackServerApp,
  stackServerAppJs,
  isStackAuthAvailable,
  requireStackServerApp,
  requireStackServerAppJs
} from "@/lib/utils/stack";

// Check if Stack Auth is available
if (isStackAuthAvailable()) {
  // Stack Auth is working
}

// Use safely with null checks
const app = stackServerApp;
if (!app) {
  // Handle Stack Auth unavailability
}

// Or require it (throws if unavailable)
const app = requireStackServerAppJs();
```

**Key Features**:
- Returns `null` instead of throwing during initialization
- Logs detailed error messages to console
- Provides utility functions to check availability
- Allows application to start even if Stack Auth is down

### 2. DataVault Operations with Retry Logic

**Location**: `apps/www/lib/utils/data-vault-operations.ts`

DataVault operations now include retry logic, timeouts, and graceful degradation:

```typescript
import {
  safeGetDataVaultValue,
  safeSetDataVaultValue,
  safeDeleteDataVaultValue,
  isDataVaultAvailable
} from "@/lib/utils/data-vault-operations";

// Get value with automatic retries
const value = await safeGetDataVaultValue(
  "cmux-snapshot-envs",
  "env_key_123",
  {
    retries: 3,           // Number of retry attempts (default: 3)
    retryDelay: 1000,     // Initial delay in ms (default: 1000)
    timeout: 10000        // Timeout per attempt in ms (default: 10000)
  }
);

if (!value) {
  // Handle failure gracefully
  console.warn("Failed to load from DataVault, using defaults");
}
```

**Key Features**:
- Automatic retry with exponential backoff
- Configurable timeouts per operation
- Returns `null`/`false` on failure instead of throwing
- Detailed logging for debugging
- Health check function

**Retry Behavior**:
- Attempt 1: Immediate
- Attempt 2: 1 second delay
- Attempt 3: 2 seconds delay
- Attempt 4: 4 seconds delay

### 3. Environment Configuration with Fallbacks

**Locations**:
- `apps/www/lib/utils/env-with-fallback.ts` (WWW app)
- `packages/convex/_shared/convex-env-with-fallback.ts` (Convex)
- `apps/client/src/client-env-with-fallback.ts` (Client app)

Environment variables are now validated with detailed error messages:

```typescript
import {
  env,
  isCriticalEnvConfigured,
  getEnvHealthStatus
} from "@/lib/utils/env-with-fallback";

// Check configuration status
const health = getEnvHealthStatus();
if (!health.isHealthy) {
  console.error("Critical configuration issues:", health.criticalIssues);
  console.warn("Warnings:", health.warnings);
}

// Check specific variable
if (!isCriticalEnvConfigured("STACK_SECRET_SERVER_KEY")) {
  // Handle missing configuration
}
```

**Key Features**:
- Detailed console warnings for missing optional variables
- Critical error logging for required variables
- Graceful fallback to empty strings (with warnings on access)
- Health check API
- Prevents application crashes from config errors

### 4. Agent Spawner Error Handling

**Location**: `apps/server/src/agentSpawner.ts`

The agent spawner now handles environment variable loading failures gracefully:

**Key Changes**:
- Environment loading failures log errors but don't block agent spawning
- Detailed logging at each step of environment variable loading
- Parse errors are caught and logged separately
- Empty environment content is handled gracefully
- Reserved environment variables (CMUX_*) are always preserved

**Behavior**:
```typescript
// If environment loading fails:
// 1. Error is logged with full details
// 2. Agent continues to spawn
// 3. User is notified that env vars may be missing
// 4. Core CMUX variables are still available
```

## Error Logging

All error handling includes comprehensive logging:

### Log Prefixes

- `[Stack Auth]` - Stack Auth initialization issues
- `[DataVault]` - DataVault operation issues
- `[EnvConfig]` - WWW app environment configuration issues
- `[ConvexEnv]` - Convex environment configuration issues
- `[ClientEnv]` - Client app environment configuration issues
- `[AgentSpawner]` - Agent spawning and environment loading issues

### Log Levels

- `console.error()` - Critical issues that prevent functionality
- `console.warn()` - Non-critical issues, features may be degraded
- `console.info()` - Successful operations with details

## Usage Examples

### Example 1: Creating an Environment with DataVault Failure Handling

```typescript
// In environments.route.ts
const success = await safeSetDataVaultValue(
  "cmux-snapshot-envs",
  dataVaultKey,
  envVarsContent
);

if (!success) {
  throw new Error(
    "Failed to persist environment variables to secure storage"
  );
}
```

### Example 2: Loading Environment Variables in Agent Spawner

```typescript
// Environment loading now includes:
// 1. Try to fetch from API
// 2. If fetch fails, log and continue
// 3. If content is empty, log and continue
// 4. If parse fails, log and continue
// 5. Always preserve CMUX_* variables
```

### Example 3: Client-Side Stack Auth Check

```typescript
import { stackClientApp } from "./lib/stack";

function MyComponent() {
  if (!stackClientApp) {
    return <ErrorMessage message="Authentication is currently unavailable" />;
  }

  // Use stackClientApp safely
}
```

## Configuration Requirements

### Critical Variables (Required for Core Functionality)

**WWW App**:
- `STACK_SECRET_SERVER_KEY`
- `STACK_SUPER_SECRET_ADMIN_KEY`
- `STACK_DATA_VAULT_SECRET` (min 32 chars)
- `CMUX_GITHUB_APP_ID`
- `CMUX_GITHUB_APP_PRIVATE_KEY`
- `MORPH_API_KEY`
- `CONVEX_DEPLOY_KEY`
- `CMUX_TASK_RUN_JWT_SECRET`
- `NEXT_PUBLIC_STACK_PROJECT_ID`
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
- `NEXT_PUBLIC_CONVEX_URL`

**Convex**:
- `STACK_WEBHOOK_SECRET`
- `BASE_APP_URL`
- `CMUX_TASK_RUN_JWT_SECRET`

**Client**:
- `NEXT_PUBLIC_CONVEX_URL`
- `NEXT_PUBLIC_STACK_PROJECT_ID`
- `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY`
- `NEXT_PUBLIC_WWW_ORIGIN`

### Optional Variables (Degraded Functionality)

- `OPENAI_API_KEY` - Users can provide their own keys
- `GEMINI_API_KEY` - Users can provide their own keys
- `ANTHROPIC_API_KEY` - Users can provide their own keys
- `NEXT_PUBLIC_GITHUB_APP_SLUG` - Some GitHub features may be limited

## Testing Error Scenarios

### Test Stack Auth Failure

```bash
# Temporarily unset Stack Auth variables
unset STACK_SECRET_SERVER_KEY
npm run dev

# Application should start but log errors
# Stack Auth features will be unavailable
```

### Test DataVault Timeout

```typescript
// Set a very short timeout
const value = await safeGetDataVaultValue(
  "cmux-snapshot-envs",
  "key",
  { timeout: 1 } // 1ms timeout will likely fail
);
// Should return null and log error
```

### Test Environment Loading Failure

```bash
# Create an environment with invalid variables
# Agent spawner should still spawn agents
# but log warnings about missing env vars
```

## Monitoring and Debugging

### Health Check Endpoints (Future Enhancement)

Consider adding these endpoints for monitoring:

```typescript
// GET /health/stack-auth
{
  "available": true,
  "message": "Stack Auth is operational"
}

// GET /health/data-vault
{
  "available": false,
  "message": "DataVault health check failed",
  "lastError": "Connection timeout"
}

// GET /health/environment
{
  "isHealthy": false,
  "criticalIssues": ["MORPH_API_KEY is not configured"],
  "warnings": ["OPENAI_API_KEY is not configured (optional)"]
}
```

### Debug Mode

Enable detailed logging by setting:
```bash
DEBUG=cmux:* npm run dev
```

## Best Practices

1. **Always use safe wrappers** for external service calls
2. **Log errors comprehensively** but don't expose sensitive data
3. **Provide user-friendly error messages** in the UI
4. **Degrade gracefully** - partial functionality is better than complete failure
5. **Test failure scenarios** regularly
6. **Monitor logs** for repeated failures indicating service issues

## Future Improvements

- [ ] Add circuit breaker pattern for repeated failures
- [ ] Implement health check endpoints
- [ ] Add metrics/telemetry for error rates
- [ ] Create admin dashboard for service health
- [ ] Add automatic retry strategies based on error types
- [ ] Implement fallback caching for DataVault values
- [ ] Add rate limiting to prevent overwhelming external services
