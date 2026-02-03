# cmux (E2B)

Go CLI for managing E2B cloud sandboxes with VSCode, VNC, and browser automation.

## Setup

```bash
# From repo root
cd apps/cmux-devbox-2

# Build and install
make build-dev
make install-dev
```

This installs `cmux` to `/usr/local/bin/cmux`.

> **Note:** If you have another `cmux` in your PATH (e.g., from npm), use the full path `/usr/local/bin/cmux` or adjust your PATH.

## Usage

```bash
# 1. Login (opens browser, one-time setup)
/usr/local/bin/cmux2 login

# 2. Create a sandbox (team auto-detected from auth)
/usr/local/bin/cmux2 start --name my-sandbox

# 3. List your sandboxes
/usr/local/bin/cmux2 ls

# 4. Run commands in a sandbox
/usr/local/bin/cmux2 exec <id> "echo hello"
/usr/local/bin/cmux2 exec <id> "ls -la /home"

# 5. Open VSCode in browser
/usr/local/bin/cmux2 open <id>

# 6. Open VNC desktop
/usr/local/bin/cmux2 open <id> --vnc

# 7. Extend timeout (keeps sandbox alive longer)
/usr/local/bin/cmux2 extend <id> --seconds 7200

# 8. Stop sandbox when done
/usr/local/bin/cmux2 stop <id>
```

Note: Team is auto-detected from your login. Use `-t <team>` to override.

## Example Session

```bash
# Setup (one time)
cd apps/cmux-devbox-2
make build-dev && make install-dev
/usr/local/bin/cmux2 login

# Create and use a sandbox
/usr/local/bin/cmux2 start --name test
# Output: Created sandbox: cmux_abc12345
#         VSCode: https://39378-xxx.e2b.app
#         VNC:    https://39380-xxx.e2b.app

# Run commands
/usr/local/bin/cmux2 exec cmux_abc12345 "uname -a"
# Output: Linux e2b.local 6.1.158 ...

/usr/local/bin/cmux2 exec cmux_abc12345 "pwd"
# Output: /home/user

# Open VSCode
/usr/local/bin/cmux2 open cmux_abc12345
# Opens browser to VSCode

# Cleanup
/usr/local/bin/cmux2 stop cmux_abc12345
```

## All Commands

| Command | Description |
|---------|-------------|
| `login` | Login via browser (opens auth page) |
| `logout` | Clear stored credentials |
| `whoami` | Show current user and team |
| `start` | Create new sandbox |
| `ls` | List all sandboxes |
| `get <id>` | Get sandbox details |
| `exec <id> <cmd>` | Run command in sandbox |
| `open <id>` | Open VSCode in browser |
| `open <id> --vnc` | Open VNC desktop in browser |
| `extend <id>` | Extend sandbox timeout |
| `stop <id>` | Stop/kill sandbox |
| `templates` | List available E2B templates |
| `version` | Show version info |

## Flags

| Flag | Description |
|------|-------------|
| `-t, --team` | Team slug (optional, auto-detected from login) |
| `-n, --name` | Name for new sandbox (with `start`) |
| `-o, --open` | Open VSCode after creation (with `start`) |
| `--seconds` | Timeout in seconds (with `extend`, default: 3600) |
| `--timeout` | Command timeout (with `exec`, default: 30) |
| `--json` | Output as JSON |
| `-v, --verbose` | Verbose output |

## Architecture

```
/usr/local/bin/cmux
         │
         ▼
   /api/v2/cmux/*  (Convex)
         │
         ▼
      E2B API  (server-side)
         │
         ▼
   E2B Sandbox
   ├── VSCode (port 39378)
   ├── VNC (port 39380)
   └── Chrome CDP (port 9222)
```
