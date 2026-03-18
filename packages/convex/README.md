# @cmux/convex

Convex backend for cmux - handles real-time state, orchestration, and data persistence.

## Overview

This package contains all Convex functions (queries, mutations, actions, HTTP endpoints) that power the cmux platform. It supports both Convex Cloud and self-hosted Convex deployments.

## Key Modules

### Orchestration

| File | Description |
|------|-------------|
| `orchestration_http.ts` | HTTP endpoints for agent spawn, status, cancel |
| `orchestrationQueries.ts` | Queries for task status, events, results |
| `agentOrchestrationLearning.ts` | Learning pipeline for rule extraction |
| `approvalBroker.ts` | Human-in-the-loop approval workflows |

### Agent System

| File | Description |
|------|-------------|
| `agentConfigs.ts` | Agent configuration CRUD |
| `agentPolicyRules.ts` | Policy rules for agent behavior |
| `agentMemoryQueries.ts` | Agent memory persistence |
| `supervisorProfiles.ts` | Supervisor settings for head agents |

### Sessions & Workspaces

| File | Description |
|------|-------------|
| `sessions.ts` | Session lifecycle management |
| `workspaces.ts` | Workspace state and settings |
| `worktreeRegistry.ts` | Git worktree tracking |

### Code Review

| File | Description |
|------|-------------|
| `codeReview.ts` | PR review state management |
| `codeReviewActions.ts` | Review actions (approve, request changes) |
| `crown/` | Crown evaluation system |

### HTTP Endpoints

| File | Description |
|------|-------------|
| `cmux_http.ts` | Main HTTP router |
| `anthropic_http.ts` | Anthropic API proxy |
| `agentMemory_http.ts` | Memory sync endpoint |
| `agentPolicyRules_http.ts` | Policy rules API |

## Development

### Local Development

```bash
# Start Convex dev server (from workspace root)
./scripts/dev.sh

# Or manually
cd packages/convex
bunx convex dev --env-file ../../.env
```

### Deployment

```bash
# Deploy to development
bun run deploy

# Deploy to production
bun run deploy:prod
```

### Testing

```bash
cd packages/convex
bun run test        # Run tests (~180 tests)
bun run typecheck   # Type check
```

### Querying Data

```bash
cd packages/convex
bunx convex data <table> --format jsonl --env-file ../../.env | rg "pattern"
```

## Schema

The schema is defined in `convex/schema.ts`. Key tables:

| Table | Description |
|-------|-------------|
| `sessions` | Active coding sessions |
| `taskRuns` | Spawned agent tasks |
| `orchestrationEvents` | Event stream for orchestration |
| `agentConfigs` | Agent configuration storage |
| `agentOrchestrationRules` | Learned orchestration rules |
| `supervisorProfiles` | Head agent supervisor settings |

## Environment

Supports two deployment modes (auto-detected by `scripts/setup-convex-env.sh`):

- **Cloud**: Set `CONVEX_DEPLOY_KEY` + `NEXT_PUBLIC_CONVEX_URL`
- **Self-hosted**: Set `CONVEX_SELF_HOSTED_ADMIN_KEY` + `CONVEX_SELF_HOSTED_URL`

## Related

- `apps/server/` - Hono HTTP server that calls Convex
- `apps/client/` - React frontend that subscribes to Convex queries
- `packages/shared/` - Shared types and utilities
