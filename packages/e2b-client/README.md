# @cmux/e2b-client

E2B sandbox client with built-in retry logic and health monitoring.

## Features

- **Retry Logic**: Automatic retries with exponential backoff and jitter for transient failures
- **Health Monitoring**: Track sandbox connection health with configurable thresholds
- **Type-Safe**: Full TypeScript support with exported interfaces

## Installation

```bash
# From workspace root
bun install
```

## Usage

### Basic Client

```typescript
import { createE2BClient } from "@cmux/e2b-client";

const client = createE2BClient({
  apiKey: process.env.E2B_API_KEY,
});

// Create a sandbox
const sandbox = await client.createSandbox({
  templateId: "your-template-id",
  timeout: 300, // seconds
});

// Execute commands
const result = await client.exec(sandbox.id, "echo hello");
console.log(result.stdout); // "hello"

// Stop sandbox
await client.stopSandbox(sandbox.id);
```

### Retry Configuration

```typescript
import { createE2BClient, E2B_SANDBOX_RETRY_OPTIONS } from "@cmux/e2b-client";

const client = createE2BClient({
  apiKey: process.env.E2B_API_KEY,
  retryOptions: {
    ...E2B_SANDBOX_RETRY_OPTIONS,
    maxRetries: 5,        // Max retry attempts
    baseDelayMs: 1000,    // Initial delay
    maxDelayMs: 30000,    // Max delay cap
  },
});

// Or disable retries
const clientNoRetry = createE2BClient({
  disableRetry: true,
});
```

### Health Monitoring

```typescript
import { E2BHealthMonitor, createE2BHealthCheck } from "@cmux/e2b-client";

// Create a health check function for your sandbox
const healthCheck = createE2BHealthCheck(client, sandboxId);

// Create monitor with custom thresholds
const monitor = new E2BHealthMonitor({
  checkIntervalMs: 30000,      // Check every 30s
  checkTimeoutMs: 10000,       // 10s timeout per check
  unhealthyThreshold: 3,       // 3 failures = unhealthy
  recoveryThreshold: 2,        // 2 successes = recovered
  degradedLatencyMs: 5000,     // >5s latency = degraded
  onStatusChange: (oldStatus, newStatus, result) => {
    console.log(`Health: ${oldStatus} -> ${newStatus}`);
  },
});

// Start monitoring
monitor.start(healthCheck);

// Get current stats
const stats = monitor.getStats();
console.log(stats.status);   // "healthy" | "degraded" | "unhealthy"
console.log(stats.uptime);   // percentage

// Stop when done
monitor.stop();
```

## API Reference

### Retry Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `maxRetries` | number | 3 | Maximum retry attempts |
| `baseDelayMs` | number | 1000 | Initial delay between retries |
| `maxDelayMs` | number | 30000 | Maximum delay cap |
| `jitterFactor` | number | 0.2 | Random jitter (0-1) |

### Health Monitor Config

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `checkIntervalMs` | number | 30000 | Interval between checks |
| `checkTimeoutMs` | number | 10000 | Timeout per check |
| `unhealthyThreshold` | number | 3 | Failures before unhealthy |
| `recoveryThreshold` | number | 2 | Successes to recover |
| `degradedLatencyMs` | number | 5000 | Latency threshold for degraded |

### Health Status

- `healthy`: All checks passing, latency normal
- `degraded`: Checks passing but latency high
- `unhealthy`: Multiple consecutive failures

## Development

```bash
cd packages/e2b-client
bun test           # Run tests (64 total)
bun run typecheck  # Type check
```
