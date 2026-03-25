---
name: devsh
description: CLI for cloud dev VMs. Install via npm for production, or build from local source for development/testing.
---

# devsh - Cloud VMs for Development

> **Note**: `devsh` can be installed via npm for production use, or built from local source (`packages/devsh`) when developing or testing the CLI itself.

| Install | Purpose | Command |
|--------|---------|--------------|
| npm | Production CLI | `npm install -g devsh` |
| source | Development build | `make install-devsh-dev` |

## Pre-flight Check

Before using `devsh` commands, verify installation:

```bash
which devsh || ~/.local/bin/devsh --version

# If not found, build and install from source:
make install-devsh-dev
```

## Quick Start

```bash
devsh auth login              # Authenticate (opens browser)
devsh start ./my-project      # Create VM, sync directory
devsh start -p pve-lxc .      # Create VM with PVE LXC provider
devsh code <id>               # Open VS Code in browser
devsh ssh <id>                # SSH into VM
devsh exec <id> "npm run dev" # Run commands
devsh pause <id>              # Pause VM
devsh resume <id>             # Resume VM
devsh delete <id>             # Delete VM
devsh ls                      # List all VMs
```

## Provider Selection

```bash
# Explicit provider
devsh start -p morph .        # Use Morph
devsh start -p pve-lxc .      # Use PVE LXC (self-hosted)

# Auto-detect from environment
export PVE_API_URL=https://pve.example.com
export PVE_API_TOKEN=root@pam!token=secret
devsh start .                 # Auto-selects pve-lxc when PVE env vars are set
```

## Commands

### Authentication
- `devsh auth login` - Login via browser
- `devsh auth logout` - Clear credentials
- `devsh auth status` - Show authentication status
- `devsh auth whoami` - Show current user
- `devsh login` - Shorthand for `auth login`
- `devsh logout` - Shorthand for `auth logout`
- `devsh whoami` - Shorthand for `auth whoami`

### VM Lifecycle
- `devsh start [path]` - Create VM, optionally sync directory
- `devsh start -p <provider>` - Specify provider (`morph`, `pve-lxc`)
- `devsh pause <id>` - Pause VM
- `devsh resume <id>` - Resume VM
- `devsh delete <id>` - Delete VM
- `devsh ls` - List VMs
- `devsh status <id>` - Show VM status and URLs

### Access VM
- `devsh code <id>` - Open VS Code in browser
- `devsh vnc <id>` - Open VNC desktop
- `devsh ssh <id>` - SSH into VM

### Work with VM
- `devsh exec <id> "<cmd>"` - Run command
- `devsh sync <id> <path>` - Sync files to VM
- `devsh sync <id> <path> --pull` - Pull files from VM

### Task Management
Tasks are the same as in the web app dashboard. CLI and web sync through Convex.

**Core Commands:**
- `devsh task list` - List active tasks
- `devsh task list --archived` - List archived tasks
- `devsh task create --repo owner/repo --agent claude-code "prompt"` - Create task
- `devsh task create --cloud-workspace ...` - Create as cloud workspace (appears in Workspaces section)
- `devsh task show <task-id>` - Get task details and runs
- `devsh task stop <task-id>` - Stop/archive task
- `devsh task memory <task-run-id>` - View agent memory for a task run

**Additional Task Commands:**
- `devsh task attach <task-run-id>` - Attach to a running task's PTY stream
- `devsh task autopilot <task-id>` - Enable/disable autopilot mode for task
- `devsh task pin <task-id>` - Pin task to dashboard
- `devsh task unpin <task-id>` - Unpin task from dashboard
- `devsh task resume <task-run-id>` - Resume a paused or failed task run with session context
- `devsh task retry <task-run-id>` - Retry a failed task run
- `devsh task runs <task-id>` - List all runs for a task
- `devsh task unarchive <task-id>` - Restore an archived task
- `devsh task status <task-id>` - Show task status with run details

Notes:
- `devsh task create` uses a positional prompt argument. `--prompt` is not a valid flag.
- For automation, prefer `--json` and poll with `devsh task show <task-id>` or `devsh task list` after creation.

### Task Workflow: Branches and Pull Requests

**Important:** Each task run automatically creates a new branch. Changes are NOT made to your existing branch.

#### Branch Behavior
- Each task creates a new branch: `{prefix}{task-slug}-{random-id}`
- The branch prefix defaults to `dev/` and is user-configurable in web UI Settings > Git
- Example: `devsh task create "Fix login bug"` creates branch `dev/fix-login-bug-x8k3a`
- Changes are committed and pushed to this new branch automatically

#### Auto-PR (Disabled by Default)
When all agents complete, the system:
1. **Crown evaluation**: Compares agent outputs and selects the best diff (winner)
2. **Push**: Pushes the winning branch to the remote repository
3. **PR creation**: Only if "Auto-PR" is enabled in Settings > General

**To enable Auto-PR:**
1. Open web UI (cmux.app or your deployment)
2. Go to Settings > General
3. Enable "Auto-create pull request with the best diff"

**To manually create a PR after task completion:**
```bash
# View the task to find the winning branch
devsh task show <task-id>

# Create PR manually with gh CLI
gh pr create --head dev/your-branch-name --title "Your PR title"
```

#### Single-Agent vs Multi-Agent Tasks
- **Single agent**: Auto-crowned immediately when completed
- **Multi-agent (Crown)**: Evaluates all diffs, crowns the best solution, then pushes

### Agent Memory
View agent memory snapshots synced from sandboxes when agents complete.

```bash
devsh task memory <task-id>              # View memory (uses latest run)
devsh task memory <task-run-id>          # View specific run's memory
devsh task memory <task-id> -t knowledge # Filter by type
devsh task memory <task-id> -t daily     # Daily logs only
devsh task memory <task-id> --json       # JSON output
```

Accepts either task ID (`p17...`) or task run ID (`ns7...`).
Memory types: `knowledge`, `daily`, `tasks`, `mailbox`

### Configuration and Discovery
- `devsh config show` - Show current configuration
- `devsh models list` - List available agent models
- `devsh models list --json` - List models as JSON
- `devsh providers list` - List available sandbox providers

### PTY (Pseudo-Terminal)
- `devsh pty <task-run-id>` - Connect to a task run's PTY
- `devsh pty-list` - List active PTY connections

### Team Management
- `devsh team list` - List your teams
- `devsh team switch <team-slug>` - Switch to a different team

### Agent Management
- `devsh agent list` - List available coding agents

### GitHub Projects (v2)
Import markdown plans into GitHub Projects as draft issues. **Note:** Only organization projects work - user-owned projects don't work with GitHub Apps.

- `devsh project import <file> --project-id <id> --installation-id <id>` - Import plan as draft issues
- `devsh project import <file> --project-id <id> --dry-run` - Preview without importing

```bash
# Get project ID
gh project list --owner <org> --format json | jq '.projects[].id'

# Import plan (H2 sections become draft issues)
devsh project import ./plan.md --project-id PVT_xxx --installation-id 12345
```

### Orchestration (Multi-Agent)
Head agent orchestration commands for spawning and coordinating sub-agents.

| Command | Description |
|---------|-------------|
| `devsh orchestrate spawn --agent <agent> "prompt"` | Spawn a sub-agent task |
| `devsh orchestrate status <task-id>` | Get sub-agent status |
| `devsh orchestrate list` | List all orchestration tasks |
| `devsh orchestrate list --status running` | Filter by status |
| `devsh orchestrate wait <task-id>` | Wait for sub-agent completion |
| `devsh orchestrate wait <task-id> --timeout 300` | Wait with timeout (seconds) |
| `devsh orchestrate cancel <task-id>` | Cancel a running sub-agent |
| `devsh orchestrate cancel <task-id> --cascade` | Cancel with dependent tasks |
| `devsh orchestrate resume <task-id>` | Resume a paused orchestration |
| `devsh orchestrate migrate <plan-file>` | Migrate local PLAN.json to sandbox |
| `devsh orchestrate message <task-id> "message"` | Send message to sub-agent |
| `devsh orchestrate debug <task-id>` | Show debug info for orchestration |
| `devsh orchestrate results <task-id>` | Get results from completed sub-agent |

**Example: Parallel task execution**
```bash
# Spawn multiple sub-agents
devsh orchestrate spawn --agent claude/sonnet-4.5 "Implement auth middleware"
devsh orchestrate spawn --agent codex/gpt-5.1-codex-mini "Write tests for auth" --depends-on <task-id>

# Monitor progress
devsh orchestrate list --status running

# Wait for all to complete
devsh orchestrate wait <task-id>
```

### Browser Automation
Full browser control via CDP (Chrome DevTools Protocol).

| Command | Description |
|---------|-------------|
| `devsh computer snapshot <id>` | Get accessibility tree with element refs |
| `devsh computer open <id> <url>` | Navigate browser to URL |
| `devsh computer click <id> <selector>` | Click element (@ref or CSS) |
| `devsh computer dblclick <id> <selector>` | Double-click element |
| `devsh computer type <id> <text>` | Type text into focused element |
| `devsh computer fill <id> <selector> <value>` | Clear and fill input field |
| `devsh computer press <id> <key>` | Press keyboard key (enter, tab, escape) |
| `devsh computer scroll <id> <direction>` | Scroll page (up, down, left, right) |
| `devsh computer screenshot <id> [file]` | Take screenshot (file or base64) |
| `devsh computer back <id>` | Navigate back in history |
| `devsh computer forward <id>` | Navigate forward |
| `devsh computer reload <id>` | Reload current page |
| `devsh computer url <id>` | Get current page URL |
| `devsh computer title <id>` | Get current page title |
| `devsh computer wait <id> <selector>` | Wait for element |
| `devsh computer hover <id> <selector>` | Hover over element |
| `devsh computer eval <id> "<js>"` | Evaluate JavaScript in page context |

**Example: Form automation**
```bash
devsh computer open cmux_abc "https://example.com/login"
devsh computer snapshot cmux_abc
devsh computer fill cmux_abc @e1 "user@example.com"
devsh computer fill cmux_abc @e2 "password123"
devsh computer click cmux_abc @e3
devsh computer wait cmux_abc ".dashboard"
devsh computer screenshot cmux_abc result.png
```

## Building from Source

```bash
# From repo root
make install-devsh-dev

# Or manually
cd packages/devsh
make build-dev
cp bin/devsh ~/.local/bin/
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
| `DEVSH_DEV=1` | Use development backend defaults |

## Advanced Workflows

### Task Retry with Session Resume
When a task fails, you can resume with preserved session context:
```bash
# View failed run details
devsh task show <task-id>

# Resume with session context preserved
devsh task resume <task-run-id>

# Or retry without session context
devsh task retry <task-run-id>
```

### Multi-Repo Orchestration
Spawn agents across multiple repositories:
```bash
# Spawn agents in different repos
devsh orchestrate spawn --repo karlorz/repo-a --agent claude/opus-4.5 "Fix API bug"
devsh orchestrate spawn --repo karlorz/repo-b --agent claude/opus-4.5 "Update client"

# Track progress across repos
devsh orchestrate list
```

### Autopilot Patterns
Enable autonomous task execution:
```bash
# Enable autopilot for a task
devsh task autopilot <task-id> --enable

# Create task with autopilot
devsh task create --repo owner/repo --agent claude-code --autopilot "Fix all lint errors"
```

## Troubleshooting

### Common Failure Patterns

| Error | Cause | Recovery |
|-------|-------|----------|
| 502/503/504 Bad Gateway | Transient server error | Retry the command, or check `devsh auth status` |
| "Failed to hydrate sandbox" | Repo URL, branch, or GitHub token issue | Verify repo exists, branch name is correct, and GitHub token has access |
| "Failed to start sandbox" | Provider credentials missing or invalid | Check `MORPH_API_KEY` or `PVE_API_URL`/`PVE_API_TOKEN` in environment |
| "not authenticated" | Session expired or missing | Run `devsh auth login` to re-authenticate |
| "access denied (403)" | Permission or team mismatch | Verify team membership and resource ownership |
| "rate limited (429)" | Too many requests | Wait a moment and retry |

### Debugging Steps

1. **Check auth status**: `devsh auth status`
2. **Verify provider**: `devsh providers list`
3. **Check environment**:
   ```bash
   echo $MORPH_API_KEY      # For Morph provider
   echo $PVE_API_URL        # For PVE-LXC provider
   ```
4. **Test with explicit provider**: `devsh start -p morph .` or `devsh start -p pve-lxc .`
5. **Check logs**: Server errors include masked details in the response

## Create Symlinks for Other Agents

```bash
mkdir -p .claude/skills
ln -s ../../.agents/skills/devsh .claude/skills/devsh
```
