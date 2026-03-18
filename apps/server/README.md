# @cmux/server

Backend server for cmux - handles agent spawning, orchestration, and real-time communication.

## Overview

This is the main backend server that powers cmux. It provides:

- **Agent Spawning**: Create and manage sandbox instances across providers
- **Orchestration API**: JWT-authenticated endpoints for head agents
- **Real-time Updates**: Socket.io for live session updates
- **Git Integration**: Diff capture and repository management

## Architecture

```
src/
├── agentSpawner.ts       # Agent spawn logic and provider routing
├── http-api.ts           # Hono HTTP API routes
├── socket-handlers.ts    # Socket.io event handlers
├── realtime.ts           # Real-time update broadcasting
├── diffs/                # Git diff utilities
├── providers/            # Sandbox provider implementations
└── vscode/               # VS Code server integration
```

## Key Modules

### Agent Spawning

| File | Description |
|------|-------------|
| `agentSpawner.ts` | Main spawn orchestration |
| `agentSpawnerSDK.ts` | SDK for programmatic spawning |

### HTTP API

| Endpoint | Description |
|----------|-------------|
| `POST /api/orchestrate/spawn` | Spawn new agent (JWT auth) |
| `GET /api/orchestrate/status/:id` | Get task status |
| `POST /api/orchestrate/cancel/:id` | Cancel running task |
| `GET /api/orchestrate/events/:id` | SSE event stream |

### Providers

The server routes spawn requests to configured providers:

- **E2B**: Cloud sandbox (primary)
- **PVE-LXC**: Self-hosted Proxmox containers
- **Morph**: Morph Cloud VMs (deprioritized)

## Development

```bash
# Start dev server (from workspace root)
./scripts/dev.sh

# Or run directly
cd apps/server
bun run dev
```

### Testing

```bash
cd apps/server
bun run test        # Run tests (~150 tests)
bun run typecheck   # Type check
```

### Environment

Key environment variables:

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_CONVEX_URL` | Convex backend URL |
| `E2B_API_KEY` | E2B provider key |
| `PVE_API_URL` | Proxmox API endpoint |
| `CMUX_TASK_RUN_JWT_SECRET` | JWT signing secret |

## Related

- `packages/convex/` - Convex backend functions
- `apps/client/` - React frontend
- `packages/e2b-client/` - E2B client library
- `packages/pve-lxc-client/` - PVE-LXC client library
