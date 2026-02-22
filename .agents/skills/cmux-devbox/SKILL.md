---
name: cmux-devbox
description: Development build of cmux CLI. Same features as cmux but built from local source for development/testing. Use cmux-devbox when developing the CLI itself.
---

# cmux-devbox - Development Build of cmux CLI

> **Note**: `cmux-devbox` is the **development version** of `cmux`. It's built from local source (`packages/cmux-devbox`) and used when developing or testing the CLI itself. For production use, install `cmux` via npm.

| Binary | Purpose | Installation |
|--------|---------|--------------|
| `cmux` | Production CLI | `npm install -g cmux` |
| `cmux-devbox` | Development CLI | `make install-cmux-devbox-dev` |

Both binaries have identical commands - only the binary name differs.

## Pre-flight Check

Before using `cmux-devbox` commands, verify installation:

```bash
which cmux-devbox || ~/.local/bin/cmux-devbox --version

# If not found, build and install from source:
make install-cmux-devbox-dev
```

## Quick Start

```bash
cmux-devbox auth login              # Authenticate (opens browser)
cmux-devbox start ./my-project      # Create VM, sync directory
cmux-devbox start -p pve-lxc .      # Create VM with PVE LXC provider
cmux-devbox code <id>               # Open VS Code in browser
cmux-devbox ssh <id>                # SSH into VM
cmux-devbox exec <id> "npm run dev" # Run commands
cmux-devbox pause <id>              # Pause VM
cmux-devbox resume <id>             # Resume VM
cmux-devbox delete <id>             # Delete VM
cmux-devbox ls                      # List all VMs
```

## Provider Selection

```bash
# Explicit provider
cmux-devbox start -p morph .        # Use Morph
cmux-devbox start -p pve-lxc .      # Use PVE LXC (self-hosted)

# Auto-detect from environment
export PVE_API_URL=https://pve.example.com
export PVE_API_TOKEN=root@pam!token=secret
cmux-devbox start .                 # Auto-selects pve-lxc when PVE env vars are set
```

## Commands

### Authentication
- `cmux-devbox auth login` - Login via browser
- `cmux-devbox auth logout` - Clear credentials
- `cmux-devbox auth status` - Show authentication status
- `cmux-devbox auth whoami` - Show current user
- `cmux-devbox login` - Shorthand for `auth login`
- `cmux-devbox logout` - Shorthand for `auth logout`
- `cmux-devbox whoami` - Shorthand for `auth whoami`

### VM Lifecycle
- `cmux-devbox start [path]` - Create VM, optionally sync directory
- `cmux-devbox start -p <provider>` - Specify provider (`morph`, `pve-lxc`)
- `cmux-devbox pause <id>` - Pause VM
- `cmux-devbox resume <id>` - Resume VM
- `cmux-devbox delete <id>` - Delete VM
- `cmux-devbox ls` - List VMs
- `cmux-devbox status <id>` - Show VM status and URLs

### Access VM
- `cmux-devbox code <id>` - Open VS Code in browser
- `cmux-devbox vnc <id>` - Open VNC desktop
- `cmux-devbox ssh <id>` - SSH into VM

### Work with VM
- `cmux-devbox exec <id> "<cmd>"` - Run command
- `cmux-devbox sync <id> <path>` - Sync files to VM
- `cmux-devbox sync <id> <path> --pull` - Pull files from VM

### Task Management
Tasks are the same as in the web app dashboard. CLI and web sync through Convex.

- `cmux-devbox task list` - List active tasks
- `cmux-devbox task list --archived` - List archived tasks
- `cmux-devbox task create --repo owner/repo --agent claude-code "prompt"` - Create task
- `cmux-devbox task show <task-id>` - Get task details and runs
- `cmux-devbox task stop <task-id>` - Stop/archive task
- `cmux-devbox task memory <task-run-id>` - View agent memory for a task run

### Agent Memory
View agent memory snapshots synced from sandboxes when agents complete.

```bash
cmux-devbox task memory <task-id>              # View memory (uses latest run)
cmux-devbox task memory <task-run-id>          # View specific run's memory
cmux-devbox task memory <task-id> -t knowledge # Filter by type
cmux-devbox task memory <task-id> -t daily     # Daily logs only
cmux-devbox task memory <task-id> --json       # JSON output
```

Accepts either task ID (`p17...`) or task run ID (`ns7...`).
Memory types: `knowledge`, `daily`, `tasks`, `mailbox`

### Team Management
- `cmux-devbox team list` - List your teams
- `cmux-devbox team switch <team-slug>` - Switch to a different team

### Agent Management
- `cmux-devbox agent list` - List available coding agents

### Browser Automation
- `cmux-devbox computer snapshot <id>` - Get accessibility tree
- `cmux-devbox computer open <id> <url>` - Navigate browser
- `cmux-devbox computer click <id> @e1` - Click element
- `cmux-devbox computer screenshot <id>` - Take screenshot

## Building from Source

```bash
# From repo root
make install-cmux-devbox-dev

# Or manually
cd packages/cmux-devbox
make build-dev
cp bin/cmux-devbox ~/.local/bin/
```

## Environment Variables

| Variable | Description |
| --- | --- |
| `PVE_API_URL` | Proxmox VE API URL |
| `PVE_API_TOKEN` | Proxmox VE API token |
| `PVE_PUBLIC_DOMAIN` | Public domain for Cloudflare Tunnel (optional) |
| `PVE_NODE` | Proxmox node name (optional, auto-detected) |
| `PVE_VERIFY_TLS` | Set to `1` to verify PVE TLS certs (optional) |
| `MORPH_API_KEY` | Morph Cloud API key |
| `CMUX_DEVBOX_DEV=1` | Use development backend defaults |

## Create Symlinks for Other Agents

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/cmux-devbox .claude/skills/cmux-devbox
```
