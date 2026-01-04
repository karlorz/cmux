#!/usr/bin/env bash
# Aggressively cleanup orphaned dev server processes and free resources
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$(dirname "$SCRIPT_DIR")"
LOCKFILE="/tmp/cmux-dev.lock"

echo "Cleaning up dev server processes..."

# Remove stale lockfile
if [ -f "$LOCKFILE" ]; then
    LOCKED_PID=$(cat "$LOCKFILE" 2>/dev/null || echo "")
    if [ -n "$LOCKED_PID" ] && kill -0 "$LOCKED_PID" 2>/dev/null; then
        echo "Killing dev.sh process (PID: $LOCKED_PID)..."
        kill -9 "$LOCKED_PID" 2>/dev/null || true
    fi
    rm -f "$LOCKFILE"
    echo "Removed lockfile"
fi

# Kill orphaned node processes (vite, next, convex, electron)
echo "Killing orphaned dev processes..."
pkill -9 -f "vite.*--host" 2>/dev/null || true
pkill -9 -f "next-server" 2>/dev/null || true
pkill -9 -f "convex dev" 2>/dev/null || true
pkill -9 -f "electron-vite" 2>/dev/null || true
pkill -9 -f "esbuild.*serve" 2>/dev/null || true

# Kill processes on specific dev ports (faster than scanning all ports)
DEV_PORTS="5173 9776 9777 9778 9779 3000 3001 8080"
for port in $DEV_PORTS; do
    pids=$(lsof -ti ":$port" 2>/dev/null || true)
    if [ -n "$pids" ]; then
        echo "Killing processes on port $port: $pids"
        echo "$pids" | xargs -r kill -9 2>/dev/null || true
    fi
done

# Clear caches that can cause issues on restart
echo "Clearing dev caches..."
rm -rf "$APP_DIR/node_modules/.vite" 2>/dev/null || true
rm -rf "$APP_DIR/apps/client/node_modules/.vite" 2>/dev/null || true
rm -rf "$APP_DIR/apps/www/.next" 2>/dev/null || true

# Stop all docker containers from this project
echo "Stopping docker containers..."
(cd "$APP_DIR/.devcontainer" && docker compose -f docker-compose.yml down 2>/dev/null) || true
(cd "$APP_DIR/.devcontainer" && docker compose -f docker-compose.devcontainer.yml down 2>/dev/null) || true
(cd "$APP_DIR/.devcontainer" && COMPOSE_PROJECT_NAME=cmux-convex docker compose -f docker-compose.convex.yml down 2>/dev/null) || true

# Clean up any dangling docker resources
docker system prune -f --filter "label=com.docker.compose.project=cmux-convex" 2>/dev/null || true

echo ""
echo "Cleanup complete"
echo ""
echo "Resource status:"
echo "  Node processes: $(pgrep -c node 2>/dev/null || echo 0)"
echo "  Docker containers: $(docker ps -q 2>/dev/null | wc -l)"
echo "  Ports 5173,9776-9779 status:"
for port in 5173 9776 9777 9778 9779; do
    pid=$(lsof -ti ":$port" 2>/dev/null || echo "free")
    if [ "$pid" = "free" ]; then
        echo "    $port: free"
    else
        echo "    $port: in use (PID: $pid)"
    fi
done
