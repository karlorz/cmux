# cmux-sandbox

Rust-based sandbox runtime for cmux - provides isolated execution environments for coding agents.

## Overview

This package provides the core sandbox infrastructure including:

- **Sandbox Daemon** (`cmux-sandboxd`): HTTP API server for sandbox management
- **CLI Tools** (`cmux`, `dmux`): Command-line interface for sandbox operations
- **PTY Multiplexer**: Terminal multiplexing with tmux integration
- **WebSocket Bridge**: Real-time terminal streaming

## Binaries

| Binary | Description |
|--------|-------------|
| `cmux-sandboxd` | Sandbox server daemon |
| `cmux` / `dmux` | CLI for sandbox management |
| `cmux-bridge` | WebSocket bridge for terminals |

## Development

```bash
cd packages/sandbox
cargo build
cargo test
cargo clippy
```

### Reload Script

After making changes:

```bash
./scripts/reload.sh  # Rebuild and restart sandbox server
```

## Architecture

```
src/
├── bin/
│   ├── server.rs     # cmux-sandboxd entry point
│   ├── cli.rs        # cmux/dmux CLI
│   └── cmux-bridge.rs
├── api.rs            # HTTP API handlers
├── mux/              # PTY multiplexer
│   ├── state.rs      # Session state management
│   └── tmux.rs       # tmux integration
├── sandbox/          # Sandbox isolation
└── lib.rs            # Library exports
```

## Configuration

The daemon reads configuration from environment variables:

| Variable | Description |
|----------|-------------|
| `CMUX_SANDBOX_PORT` | HTTP API port |
| `CMUX_LOG_LEVEL` | Log verbosity |

## Agent Instructions

Agent-specific instructions are in:

- `CLAUDE.md` - Claude Code instructions
- `GEMINI.md` - Gemini CLI instructions
- `AGENTS.md` - General agent guidelines

## Related

- `apps/server/` - Backend that spawns sandboxes
- `packages/e2b-client/` - E2B provider client
- `packages/pve-lxc-client/` - PVE-LXC provider client
