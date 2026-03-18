# cmux VS Code Extension

VS Code extension for cmux sandbox integration.

## Overview

This extension provides VS Code integration for cmux sandboxes, enabling:

- Custom terminal profiles connected to sandbox PTY sessions
- Git diff views against base branches
- Session management commands

## Features

### Commands

| Command | Description |
|---------|-------------|
| `cmux.run` | Run cmux in the current workspace |
| `cmux.newTerminal` | Open a new cmux terminal |
| `cmux.listSessions` | List active PTY sessions |
| `cmux.renameTerminal` | Rename the current terminal |
| `cmux.git.openAllChangesAgainstBase` | Open diff view vs base branch |
| `cmux.showOutput` | Show cmux output channel |

### Terminal Profile

The extension registers a `cmux.terminal` profile that connects to sandbox PTY sessions via WebSocket.

## Development

### Build

```bash
cd packages/vscode-extension
bun install
bun run compile
```

### Package

```bash
bun run package  # Creates .vsix file
```

### Debug

1. Open the extension folder in VS Code
2. Press F5 to launch Extension Development Host
3. Run commands from the Command Palette (Ctrl+Shift+P)

## Configuration

The extension reads configuration from:

- `CMUX_SERVER_URL` - Server URL for API calls
- `CMUX_SESSION_ID` - Current session identifier

## Architecture

```
src/
├── extension.ts      # Extension entry point
├── commands/         # Command implementations
├── terminal/         # Terminal profile provider
└── git/              # Git integration utilities
```

## Related

- `packages/sandbox/` - Sandbox runtime (Rust)
- `apps/server/` - Backend server
- `apps/client/` - Web UI
