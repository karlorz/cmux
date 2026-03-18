# @cmux/shared

Shared utilities, types, and modules used across the cmux monorepo.

## Overview

This package provides common functionality including:

- **Agent Configuration**: Agent catalogs, configs, and policy rules
- **Socket Communication**: WebSocket client/server for real-time updates
- **Provider Types**: Sandbox provider interfaces and presets
- **Memory Protocol**: Agent memory system for cross-session persistence
- **Model Usage**: Token counting and usage tracking
- **Crown Evaluation**: Code review and task completion scoring
- **Resilience**: Circuit breakers, retry logic, rate limiting

## Installation

This is a private workspace package. Import from other packages in the monorepo:

```typescript
import { agentCatalog } from "@cmux/shared/agent-catalog";
import { CircuitBreaker } from "@cmux/shared/resilience";
```

## Key Modules

### Agent System

| Export | Description |
|--------|-------------|
| `agent-catalog` | Registry of supported AI agents (Claude, Codex, Gemini, etc.) |
| `agentConfig` | Agent configuration schemas and types |
| `agent-policy` | Policy rules for agent behavior |
| `agent-memory-protocol` | Cross-session memory persistence |

### Communication

| Export | Description |
|--------|-------------|
| `socket` | WebSocket client for browser |
| `node/socket` | WebSocket server for Node.js |
| `agent-comm-events` | Inter-agent communication event types |

### Providers

| Export | Description |
|--------|-------------|
| `provider-types` | Sandbox provider interfaces |
| `sandbox-presets` | Pre-configured sandbox templates |
| `e2b-templates` | E2B sandbox template definitions |

### Resilience

| Export | Description |
|--------|-------------|
| `resilience` | Circuit breakers, retry with backoff |
| `resilience/circuit-breaker` | Circuit breaker implementation |
| `resilience/retry` | Retry with exponential backoff and jitter |

### Utilities

| Export | Description |
|--------|-------------|
| `utils/typed-zid` | Type-safe Zod ID generation |
| `utils/reserved-cmux-ports` | Port allocation constants |
| `obsidian-reader` | Obsidian vault parsing utilities |

## Development

```bash
cd packages/shared
bun run test        # Run tests (439 tests)
bun run typecheck   # Type check
```

## Test Coverage

The package has comprehensive test coverage including:
- Agent catalog validation
- Memory protocol operations
- Circuit breaker state transitions
- Retry logic with jitter
- WebSocket event handling
