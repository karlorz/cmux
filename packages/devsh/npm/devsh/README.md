# devsh

Cloud VMs for development - spawn isolated dev environments instantly.

## Installation

```bash
npm install -g devsh
```

## Quick Start

```bash
# Login
devsh login

# Create a VM
devsh start                     # Returns ID

# Access the VM
devsh code <id>          # Open VS Code in browser
devsh ssh <id>           # SSH into VM

# Run commands
devsh exec <id> "npm install"

# Manage lifecycle
devsh pause <id>         # Pause (preserves state)
devsh resume <id>        # Resume
devsh delete <id>        # Delete permanently

# List all VMs
devsh ls
```

## Commands

| Command | Description |
|---------|-------------|
| `devsh login` | Login via browser |
| `devsh start [path]` | Create new VM, optionally sync directory |
| `devsh ls` | List all VMs |
| `devsh code <id>` | Open VS Code in browser |
| `devsh vnc <id>` | Open VNC desktop in browser |
| `devsh ssh <id>` | SSH into VM |
| `devsh pty <id>` | Open interactive terminal |
| `devsh exec <id> "cmd"` | Execute command |
| `devsh sync <id> <path>` | Sync files to VM |
| `devsh pause <id>` | Pause VM |
| `devsh resume <id>` | Resume VM |
| `devsh delete <id>` | Delete VM |

## Local Orchestration

Run agents locally without cloud infrastructure:

```bash
# Run a task with Claude
devsh orchestrate run-local --agent claude/haiku-4.5 "Fix the bug in auth.ts"

# Use different agent providers
devsh orchestrate run-local --agent codex/gpt-5.1-codex-mini "Add tests"
devsh orchestrate run-local --agent gemini/gemini-2.5-pro "Refactor code"
devsh orchestrate run-local --agent opencode/big-pickle "Review changes"
devsh orchestrate run-local --agent amp/amp-1 "Quick fix"

# Dry-run to see what would execute
devsh orchestrate run-local --dry-run "Add unit tests"

# Override the model (Claude only)
devsh orchestrate run-local --model claude-sonnet-4-5-20250514 "Complex refactor"

# Export state for debugging
devsh orchestrate run-local --export ./debug.json "Investigate issue"

# JSON output for scripting
devsh orchestrate run-local --json "Quick task" | jq .status
```

Supported agents: `claude/*`, `codex/*`, `gemini/*`, `opencode/*`, `amp/*`

View exported orchestration bundles offline:

```bash
devsh orchestrate view ./debug-bundle.json
```

## Browser Automation

Control Chrome in the VNC desktop:

```bash
devsh computer open <id> https://example.com
devsh computer snapshot <id>       # Get interactive elements
devsh computer click <id> @e1      # Click element
devsh computer type <id> "hello"   # Type text
devsh computer screenshot <id>     # Take screenshot
```

## Platform Support

- macOS (Apple Silicon & Intel)
- Linux (x64 & ARM64)
- Windows (x64)

## License

MIT
