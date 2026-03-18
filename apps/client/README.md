# @cmux/client

React frontend for cmux - the web UI for managing coding agents and orchestration.

## Overview

This is the main web application that provides:

- **Dashboard**: View and manage active sessions and tasks
- **Orchestration UI**: Monitor agent teams and task progress
- **Settings**: Configure agents, rules, and preferences
- **Terminal**: Embedded terminal for sandbox interaction

## Tech Stack

- **React 19** with TypeScript
- **TanStack Router** for routing
- **TanStack Query** for data fetching
- **Convex** for real-time subscriptions
- **Shadcn UI** + Tailwind CSS for styling
- **Vite** for development and builds

## Development

```bash
# Start dev server (from workspace root)
./scripts/dev.sh

# Or run directly
cd apps/client
bun run dev
```

The client runs on `http://localhost:5173` by default.

### Testing

```bash
cd apps/client
bun run test        # Run tests (116 tests)
bun run typecheck   # Type check
```

## Key Components

### Dashboard

| Component | Description |
|-----------|-------------|
| `TaskItem.tsx` | Individual task card |
| `SessionList.tsx` | Active session list |
| `TaskFilters.tsx` | Filter and search tasks |

### Orchestration

| Component | Description |
|-----------|-------------|
| `OrchestrationDashboard.tsx` | Main orchestration view |
| `OrchestrationTaskDetail.tsx` | 3-surface task detail |
| `OrchestrationEventStream.tsx` | Real-time event log |
| `OrchestrationDependencyGraph.tsx` | Task dependency visualization |

### Settings

| Component | Description |
|-----------|-------------|
| `OrchestrationRulesSection.tsx` | Manage learning rules |
| `AgentConfigsSection.tsx` | Agent configurations |
| `SupervisorProfilesSection.tsx` | Supervisor settings |

## Environment

| Variable | Description |
|----------|-------------|
| `VITE_CONVEX_URL` | Convex backend URL |
| `VITE_SERVER_URL` | Server API URL |

## Related

- `apps/server/` - Backend server
- `packages/convex/` - Convex functions
- `apps/www/` - Landing page and auth
