# cmux CLI Guide

> **Primary CLI**: `devsh` is the primary operator CLI for cmux.
> **Last Updated**: 2026-03-24

## Quick Start

```bash
# Install devsh (production)
npm install -g @cmux/devsh

# Or for development (from repo root)
make install-devsh-dev

# Authenticate
devsh auth login

# Start a sandbox
devsh start -p pve-lxc

# List running sandboxes
devsh ls
```

## CLI Surfaces

cmux provides multiple CLIs for different use cases:

| CLI | Purpose | Primary Audience |
|-----|---------|------------------|
| **`devsh`** | Primary operator CLI for tasks, sandboxes, orchestration | Operators, developers |
| `cloudrouter` | Specialized GPU/browser automation CLI | Advanced users, GPU lanes |
| `cmux` (Rust) | Internal runtime tooling | System internals |

**Recommendation**: Use `devsh` for all common operations. Use `cloudrouter` only for GPU-specific or specialized browser automation.

## devsh Commands

### Authentication

```bash
devsh auth login       # Login via browser
devsh auth logout      # Clear local credentials
devsh auth whoami      # Show current user/team
```

### Sandbox Management

```bash
# Start sandbox (auto-detects provider from env)
devsh start

# Start with specific provider
devsh start -p pve-lxc    # PVE-LXC (fastest, cheapest)
devsh start -p e2b        # E2B (managed pause/resume)
devsh start -p morph      # Morph (fallback)

# List sandboxes
devsh ls
devsh list
devsh ps

# Stop/delete sandbox
devsh stop <id>
devsh delete <id>

# Pause/resume (E2B only)
devsh pause <id>
devsh resume <id>

# Execute command in sandbox
devsh exec <id> "command"
```

### Task Orchestration

```bash
# Create task
devsh task create --repo owner/repo "Fix the auth bug"

# Create task with specific agent
devsh task create --repo owner/repo --agent claude/opus-4.5 "Implement feature"

# List tasks
devsh task list

# View task details
devsh task view <task-id>
```

### Local Development

```bash
# Open VS Code connected to sandbox
devsh code <id>

# Sync local directory to sandbox
devsh sync <id> .

# SSH into sandbox
devsh ssh <id>
```

## Provider Selection

devsh automatically selects a provider based on environment variables:

| Provider | Required Env Vars | Priority |
|----------|-------------------|----------|
| PVE-LXC | `PVE_API_URL`, `PVE_API_TOKEN` | 1 (highest) |
| E2B | `E2B_API_KEY` | 2 |
| Morph | `MORPH_API_KEY` | 3 (fallback) |

Override with `-p/--provider` flag:

```bash
devsh start -p e2b        # Force E2B
devsh start -p pve-lxc    # Force PVE-LXC
```

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `DEVSH_DEV=1` | Use development API endpoints |
| `DEVSH_PROD=1` | Force production mode |
| `SANDBOX_PROVIDER` | Default provider override |

## Configuration

Config files are stored in `~/.config/cmux/`:

- `config.json` - User configuration
- `tokens.json` - Auth tokens (auto-managed)
- `cmux_devbox_state_{dev,prod}.json` - Sandbox state mapping

## cloudrouter (Specialized)

For GPU lanes and browser automation:

```bash
# Install
npm install -g @cmux/cloudrouter

# Start with GPU
cloudrouter start . -p modal

# Browser automation
cloudrouter browser <url>
```

## Troubleshooting

### "Not authenticated"

```bash
devsh auth login
```

### "Failed to create PVE LXC client"

Set required environment variables:

```bash
export PVE_API_URL=https://your-pve-host:8006
export PVE_API_TOKEN=user@pam!token-name=secret
```

### Provider not available

Check environment variables for your desired provider:

```bash
env | grep -E "PVE_|E2B_|MORPH_"
```

## Related Docs

- [Platform Simplification Strategy](./PLATFORM_SIMPLIFICATION_STRATEGY.md)
- [OPS Launch Checklist](./OPS_LAUNCH_CHECKLIST.md)
- [Coolify Deployment](./COOLIFY_DEPLOYMENT.md)
