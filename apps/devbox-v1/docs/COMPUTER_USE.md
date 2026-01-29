# DBA Computer Use - Browser Automation

DBA Computer Use provides browser automation capabilities using Morph Cloud VMs and the `agent-browser` CLI tool. This allows AI agents to interact with web applications through a clean, ref-based API.

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              MORPH CLOUD VM                                      │
│                                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────────────┐   │
│  │   code-server     │  │   Your App        │  │   Chrome + CDP            │   │
│  │   (VS Code IDE)   │  │   (dev server)    │  │   (browser automation)    │   │
│  │   :10080          │  │   :10000          │  │   :9222                   │   │
│  └───────────────────┘  └───────────────────┘  └───────────────────────────┘   │
│                                                                                  │
│  ┌───────────────────┐  ┌───────────────────┐                                   │
│  │   TigerVNC        │  │   noVNC           │                                   │
│  │   :5901           │  │   :6080           │                                   │
│  └───────────────────┘  └───────────────────┘                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Benefits over Docker-based approach

| Feature | Docker (Old) | Morph Cloud (New) |
|---------|--------------|-------------------|
| Boot Time | ~30 seconds | <250ms (from snapshot) |
| State Persistence | None | Full VM snapshots |
| Element Selection | Coordinate-based (x, y) | Ref-based (@e1, @e2) |
| Context Efficiency | Low | 93% reduction |
| Environment | Local + Container | Full cloud VM |

## Commands Reference

### VM Lifecycle Commands

#### `dba computer start`
Start a Morph Cloud VM for the workspace.

```bash
# Start from base snapshot
dba computer start

# Start from a specific snapshot ID
dba computer start --snapshot=snap_abc123

# Start from a saved snapshot by name
dba computer start --from=my-checkpoint
```

#### `dba computer stop`
Stop the Morph Cloud VM.

```bash
# Stop the VM
dba computer stop

# Stop and save snapshot before stopping
dba computer stop --save=my-state
```

#### `dba computer status`
Show VM status and connection URLs.

```bash
dba computer status
dba computer status --json
```

Output:
```
Status: running
Instance: morph-inst-xyz
Uptime: 5m 30s

VS Code: https://ws-abc123.morph.so/code/
VNC:     https://ws-abc123.morph.so/vnc/
App:     https://ws-abc123.morph.so/app/
```

#### `dba computer save`
Save current VM state as a snapshot.

```bash
dba computer save
dba computer save --name=after-login
```

#### `dba computer vnc`
Open the VNC viewer in your browser.

```bash
dba computer vnc
```

### Element Discovery

#### `dba computer snapshot`
Get interactive elements with refs. This is the key command for AI agents.

```bash
dba computer snapshot
dba computer snapshot -i  # Interactive elements only (default)
```

Output:
```
@e1: button "Login"
@e2: input "Email address"
@e3: input "Password"
@e4: link "Forgot password?"
@e5: button "Sign up"
```

### Interaction Commands

#### `dba computer click`
Click an element by ref, CSS selector, or text.

```bash
dba computer click @e1           # Click by ref
dba computer click "#submit-btn" # Click by CSS selector
dba computer click "text=Login"  # Click by visible text
```

#### `dba computer dblclick`
Double-click an element.

```bash
dba computer dblclick @e1
```

#### `dba computer type`
Type text into an element (appends to existing content).

```bash
dba computer type @e2 "additional text"
```

#### `dba computer fill`
Clear and fill an element with text.

```bash
dba computer fill @e2 "test@example.com"
dba computer fill @e3 "password123"
```

#### `dba computer press`
Press a keyboard key.

```bash
dba computer press Enter
dba computer press Tab
dba computer press Control+a
dba computer press Escape
```

#### `dba computer hover`
Hover over an element.

```bash
dba computer hover @e1
```

#### `dba computer select`
Select an option in a dropdown.

```bash
dba computer select @e5 "Option 2"
```

#### `dba computer scroll`
Scroll the page.

```bash
dba computer scroll down
dba computer scroll up 500
dba computer scroll left
dba computer scroll right
```

### Navigation Commands

#### `dba computer open`
Navigate to a URL.

```bash
dba computer open "https://example.com"
dba computer open "http://localhost:10000"
```

#### `dba computer back`
Go back in browser history.

```bash
dba computer back
```

#### `dba computer forward`
Go forward in browser history.

```bash
dba computer forward
```

#### `dba computer reload`
Reload the current page.

```bash
dba computer reload
```

### Information Commands

#### `dba computer screenshot`
Take a screenshot.

```bash
dba computer screenshot                    # Print base64 to stdout
dba computer screenshot --output=shot.png  # Save to file
dba computer screenshot --full             # Full page screenshot
```

#### `dba computer get`
Get information from the page.

```bash
dba computer get title           # Get page title
dba computer get url             # Get current URL
dba computer get text @e1        # Get element text
dba computer get value @e2       # Get input value
dba computer get attr @e1 href   # Get element attribute
```

#### `dba computer is`
Check element state.

```bash
dba computer is visible @e1
dba computer is enabled @e2
dba computer is checked @e3
```

### Wait Commands

#### `dba computer wait`
Wait for elements or conditions.

```bash
dba computer wait @e1                    # Wait for element
dba computer wait 2000                   # Wait 2 seconds
dba computer wait --text "Success"       # Wait for text
dba computer wait --url "/dashboard"     # Wait for URL pattern
dba computer wait @e1 --timeout=10000    # Custom timeout
```

### Utility Commands

#### `dba computer app`
Open the app in browser and show interactive elements.

```bash
dba computer app               # Auto-detect app port
dba computer app --port 3000   # Specific port
dba computer app --no-browser  # Show URL only, don't open browser
```

#### `dba computer ports`
List active ports in the VM.

```bash
dba computer ports
dba computer ports --json
```

## Example Workflow

```bash
# 1. Start the VM
dba computer start -w myapp

# 2. Open your app
dba computer open "http://localhost:10000" -w myapp

# 3. Get interactive elements
dba computer snapshot -i -w myapp
# Output:
# @e1: button "Login"
# @e2: input "Email address"
# @e3: input "Password"

# 4. Fill in the form
dba computer fill @e2 "test@example.com" -w myapp
dba computer fill @e3 "password123" -w myapp

# 5. Click login
dba computer click @e1 -w myapp

# 6. Verify the result
dba computer get url -w myapp
# Output: http://localhost:10000/dashboard

# 7. Take a screenshot
dba computer screenshot --output=after-login.png -w myapp

# 8. Save state for later
dba computer save --name=logged-in -w myapp

# 9. Stop when done
dba computer stop -w myapp
```

## Best Practices for AI Agents

### 1. Always refresh refs after navigation
```bash
dba computer open "https://example.com"
dba computer snapshot -i  # Get fresh refs!
dba computer click @e1    # Now use the refs
```

### 2. Verify actions with screenshots or getters
```bash
dba computer fill @e2 "test@example.com"
dba computer get value @e2  # Verify it was filled
```

### 3. Use waits for dynamic content
```bash
dba computer click @e1
dba computer wait --text "Welcome"  # Wait for response
dba computer snapshot -i            # Then get refs
```

### 4. Handle errors gracefully
```bash
# Check if element exists before clicking
dba computer snapshot -i | grep -q "@e1" && dba computer click @e1
```

## Configuration

Add to `~/.dba/config.yaml`:

```yaml
morph:
  api_key: "${MORPH_API_KEY}"
  base_snapshot_id: "snap_your_base_snapshot"
  vm:
    vcpus: 2
    memory: 4096
    disk_size: 32768
    ttl_seconds: 3600

agent_browser:
  path: "agent-browser"
  timeout: 30000
  session_prefix: "dba"
```

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MORPH_API_KEY` | Your Morph Cloud API key |
| `DBA_BASE_SNAPSHOT` | Default base snapshot ID |
