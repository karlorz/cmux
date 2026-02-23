---
name: cmux
description: Manage cloud development VMs with cmux. Create, sync, and access remote VMs. Includes browser automation via Chrome CDP for scraping, testing, and web interaction.
---

# cmux - Cloud VMs for Development

cmux manages cloud VMs for development. Use these commands to create, manage, and access remote development environments with built-in browser automation.

> **Note**: This skill documents the Go-based cmux CLI from `packages/cmux-devbox`. The npm package `cmux` installs this CLI.

## Installation

```bash
npm install -g cmux
```

Or build from source:
```bash
cd packages/cmux-devbox
make build
./bin/cmux-devbox --help
```

## Quick Start

```bash
cmux auth login                 # Authenticate (opens browser)
cmux start ./my-project         # Create VM, sync directory, returns ID
cmux start .                    # Or use current directory
cmux code <id>                  # Open VS Code in browser
cmux ssh <id>                   # SSH into VM
cmux vnc <id>                   # Open VNC desktop in browser
cmux exec <id> "npm run dev"    # Run commands in VM
cmux sync <id> ./my-project     # Sync files to VM
cmux pause <id>                 # Pause VM (preserves state)
cmux resume <id>                # Resume paused VM
cmux delete <id>                # Delete VM permanently
cmux ls                         # List all VMs
```

## Commands

### Authentication

```bash
cmux auth login          # Login via browser (opens auth URL)
cmux auth logout         # Logout and clear credentials
cmux auth status         # Show authentication status
cmux auth whoami         # Show current user
```

### VM Lifecycle

```bash
cmux start                       # Create VM (no sync)
cmux start .                     # Create VM, sync current directory
cmux start ./my-project          # Create VM, sync specific directory
cmux start --snapshot=snap_xxx   # Create from specific snapshot
cmux pause <id>                  # Pause VM (preserves state, saves cost)
cmux resume <id>                 # Resume paused VM
cmux delete <id>                 # Delete VM permanently
cmux ls                          # List all VMs (aliases: list, ps)
cmux status <id>                 # Show VM status and URLs
```

### Access VM

```bash
cmux code <id>           # Open VS Code in browser
cmux vnc <id>            # Open VNC desktop in browser
cmux ssh <id>            # SSH into VM
```

### Work with VM

```bash
cmux exec <id> "<command>"       # Run a command in VM
cmux sync <id> <path>            # Sync local directory to VM
cmux sync <id> <path> --pull     # Pull files from VM to local
```

**Excluded by default:** `.git`, `node_modules`, `.next`, `dist`, `build`, `__pycache__`, `.venv`, `venv`, `target`

### Task Management

Tasks are synced between CLI and web app through Convex as the source of truth.

```bash
cmux task list                   # List all active tasks
cmux task list --archived        # List archived tasks
cmux task create "Add tests"     # Create task with prompt only
cmux task create --repo owner/repo --agent claude-code "Fix bug"
cmux task create --repo owner/repo --agent claude-code --agent opencode/gpt-4o "Compare solutions"
cmux task show <task-id>         # Get task details and runs
cmux task stop <task-id>         # Stop/archive task
cmux task memory <task-run-id>   # View agent memory for a task run
```

### Agent Memory

View agent memory snapshots (knowledge, daily logs, tasks, mailbox) synced from sandboxes.

```bash
cmux task memory <task-id>                    # View memory (uses latest task run)
cmux task memory <task-run-id>                # View memory for specific run
cmux task memory <task-id> --type knowledge   # Filter by memory type
cmux task memory <task-id> --type daily       # View daily logs only
cmux task memory <task-id> --type tasks       # View task tracking
cmux task memory <task-id> --type mailbox     # View mailbox messages
cmux task memory <task-id> --json             # Output as JSON
```

You can use either:
- **Task ID** (e.g., `p17xyz...`) - automatically uses the latest task run
- **Task run ID** (e.g., `ns7xyz...`) - uses that specific run

Memory types:
- **knowledge**: Accumulated knowledge and learnings (P0/P1/P2 priority tiers)
- **daily**: Daily activity logs (ephemeral, session-specific)
- **tasks**: Task tracking and progress (JSON)
- **mailbox**: Communication messages between agents (JSON)

Memory is synced when an agent completes. If no memory appears, the task run may still be in progress.

### Team Management

```bash
cmux team list                   # List your teams
cmux team switch <team-slug>     # Switch to a different team
```

### Agent Management

```bash
cmux agent list                  # List available coding agents
```

### Model Management

```bash
cmux models list                       # List all available models
cmux models list --provider anthropic  # Filter by vendor
cmux models list --verbose             # Show API keys required
cmux models list --enabled-only        # Only show enabled models
cmux models list --json                # JSON output for scripting
cmux models list claude                # Filter by name
```

### Browser Automation (cmux computer)

Control Chrome browser via CDP in the VM's VNC desktop.

#### Navigation

```bash
cmux computer open <id> <url>    # Navigate to URL
cmux computer back <id>          # Navigate back
cmux computer forward <id>       # Navigate forward
cmux computer reload <id>        # Reload page
cmux computer url <id>           # Get current URL
cmux computer title <id>         # Get page title
```

#### Inspect Page

```bash
cmux computer snapshot <id>             # Get accessibility tree with element refs (@e1, @e2...)
cmux computer screenshot <id>           # Take screenshot (base64 to stdout)
cmux computer screenshot <id> out.png   # Save screenshot to file
cmux computer screenshot <id> --full-page  # Full page capture
```

#### Interact with Elements

```bash
cmux computer click <id> <selector>      # Click element (@e1 or CSS selector)
cmux computer type <id> "text"           # Type into focused element
cmux computer fill <id> <sel> "value"    # Clear input and fill with value
cmux computer press <id> <key>           # Press key (enter, tab, escape, etc.)
cmux computer hover <id> <selector>      # Hover over element
cmux computer scroll <id> <direction>    # Scroll page (up/down/left/right)
cmux computer scroll <id> down 500       # Scroll with custom amount (pixels)
cmux computer wait <id> <selector>       # Wait for element to appear
cmux computer wait <id> <sel> --state=hidden  # Wait for element to be hidden
```

#### Element Selectors

Two ways to select elements:
- **Element refs** from snapshot: `@e1`, `@e2`, `@e3`...
- **CSS selectors**: `#id`, `.class`, `button[type="submit"]`

## VM IDs

VM IDs look like `cmux_abc12345`. Use the full ID when running commands. Get IDs from `cmux ls` or `cmux start` output.

## Common Workflows

### Create and develop in a VM

```bash
cmux start ./my-project        # Creates VM, syncs files
cmux code cmux_abc123          # Open VS Code
cmux exec cmux_abc123 "npm install && npm run dev"
```

### File sync workflow

```bash
cmux sync cmux_abc123 ./my-project       # Push local files to VM
# ... do work in VM ...
cmux sync cmux_abc123 ./output --pull    # Pull files from VM to local
```

### Browser automation: Login to a website

```bash
cmux computer open cmux_abc123 "https://example.com/login"
cmux computer snapshot cmux_abc123
# Output: @e1 [input] Email, @e2 [input] Password, @e3 [button] Sign In

cmux computer fill cmux_abc123 @e1 "user@example.com"
cmux computer fill cmux_abc123 @e2 "password123"
cmux computer click cmux_abc123 @e3
cmux computer screenshot cmux_abc123 result.png
```

### Typical development workflow

```bash
# Start of day: create or resume a VM
cmux start ./my-project
# -> cmux_abc123

# Work on your code
cmux code cmux_abc123        # Opens VS Code in browser

# Run commands
cmux exec cmux_abc123 "npm run dev"

# Sync changes
cmux sync cmux_abc123 ./my-project

# End of day: pause to save costs
cmux pause cmux_abc123

# Next day: resume where you left off
cmux resume cmux_abc123
```

### Clean up

```bash
cmux pause cmux_abc123     # Pause (can resume later)
cmux delete cmux_abc123    # Delete permanently
```

## Global Flags

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help for a command |
| `--json` | Output as JSON |
| `-v, --verbose` | Verbose output |
| `-p, --provider` | Sandbox provider: `morph`, `pve-lxc` (auto-detected from env) |

## Shorthand Commands

```bash
cmux login              # Shorthand for cmux auth login
cmux logout             # Shorthand for cmux auth logout
cmux whoami             # Shorthand for cmux auth whoami
```

## Security: Dev Server URLs

**CRITICAL: NEVER share or output raw port-forwarded URLs.**

When a dev server runs in the VM (e.g., Vite on port 5173), the provider may create publicly accessible URLs. These URLs have **NO authentication**.

**Rules:**
- **ALWAYS** tell the user to view dev servers through VNC: `cmux vnc <id>`
- VNC is protected by token authentication and is the only safe way to view dev server output
- Only VS Code URLs (`cmux code <id>`) and VNC URLs (`cmux vnc <id>`) should be shared

## Tips

- Run `cmux auth login` first if not authenticated
- Use `--json` flag for machine-readable output
- Use `-v` for verbose output
- Always run `snapshot` first to see available elements before browser automation
- Use element refs (`@e1`) for reliability over CSS selectors
- Use `cmux pause` to preserve state and save costs when not actively working

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CMUX_DEVBOX_DEV=1` | Use development environment |
| `PVE_API_URL` | Proxmox VE API URL (enables pve-lxc provider) |
| `PVE_API_TOKEN` | Proxmox VE API token |
| `PVE_PUBLIC_DOMAIN` | Public domain for Cloudflare Tunnel |
| `MORPH_API_KEY` | Morph Cloud API key |
