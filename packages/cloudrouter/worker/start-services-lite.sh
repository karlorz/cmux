#!/bin/bash
# Start all services for the cmux E2B sandbox (Lite version - no Docker/JupyterLab)
# Services: cmux-code (VSCode), Chrome CDP, VNC, noVNC, worker daemon (Go)

echo "[cmux-lite] Starting services..."

# Generate fresh auth token on startup
AUTH_TOKEN_FILE="/home/user/.worker-auth-token"
VSCODE_TOKEN_FILE="/home/user/.vscode-token"
BOOT_ID_FILE="/home/user/.token-boot-id"

AUTH_TOKEN=$(openssl rand -hex 32)
printf "%s" "$AUTH_TOKEN" > "$AUTH_TOKEN_FILE"
chmod 644 "$AUTH_TOKEN_FILE"
chown user:user "$AUTH_TOKEN_FILE"

echo "[cmux-lite] Auth token generated: ${AUTH_TOKEN:0:8}..."

# Create VSCode connection token file
printf "%s" "$AUTH_TOKEN" > "$VSCODE_TOKEN_FILE"
chmod 644 "$VSCODE_TOKEN_FILE"
chown user:user "$VSCODE_TOKEN_FILE"

# Save current boot ID
BOOT_ID=$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || echo "unknown")
echo "$BOOT_ID" > "$BOOT_ID_FILE"
chmod 644 "$BOOT_ID_FILE"
chown user:user "$BOOT_ID_FILE"
echo "[cmux-lite] Boot ID saved: ${BOOT_ID:0:8}..."

# Start D-Bus for desktop environment
echo "[cmux-lite] Starting D-Bus..."
sudo mkdir -p /run/dbus 2>/dev/null || true
sudo dbus-daemon --system --fork 2>/dev/null || true

# Start VNC server on display :1 (port 5901) - localhost only
echo "[cmux-lite] Starting VNC server on display :1..."
rm -f /tmp/.X1-lock /tmp/.X11-unix/X1 2>/dev/null || true
vncserver :1 -geometry 1920x1080 -depth 24 -SecurityTypes None -localhost yes 2>/dev/null &
sleep 3

# Start cmux-code (VSCode) on port 39378
echo "[cmux-lite] Starting cmux-code on port 39378..."
/app/cmux-code/bin/code-server-oss \
    --host 0.0.0.0 \
    --port 39378 \
    --connection-token-file "$VSCODE_TOKEN_FILE" \
    --disable-workspace-trust \
    --disable-telemetry \
    /home/user/workspace 2>/dev/null &

# Chrome with CDP will be started by VNC xstartup
echo "[cmux-lite] Chrome CDP will be available on port 9222 (started via VNC)"

# Create agent-browser wrapper
cat > /usr/local/bin/ab << 'WRAPPER_EOF'
#!/bin/bash
if [ ! -S "$HOME/.agent-browser/default.sock" ] || ! agent-browser get url >/dev/null 2>&1; then
  mkdir -p "$HOME/.agent-browser"
  agent-browser connect 9222 >/dev/null 2>&1
fi
exec agent-browser "$@"
WRAPPER_EOF
chmod +x /usr/local/bin/ab

# Start worker daemon on port 39377
echo "[cmux-lite] Starting worker daemon on port 39377..."
/usr/local/bin/worker-daemon &

echo "[cmux-lite] All services started!"
echo "[cmux-lite] Services:"
echo "  - VSCode:  http://localhost:39378?tkn=$AUTH_TOKEN"
echo "  - Worker:  http://localhost:39377 (use Bearer token)"
echo "  - VNC:     http://localhost:39380?tkn=$AUTH_TOKEN"
echo "  - Chrome:  http://localhost:9222"
echo ""
echo "[cmux-lite] Auth token stored at: $AUTH_TOKEN_FILE"

# Keep running
tail -f /dev/null
