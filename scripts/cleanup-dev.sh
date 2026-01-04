#!/usr/bin/env bash
# Cleanup orphaned dev server processes for this project (or all projects)
# Usage:
#   ./scripts/cleanup-dev.sh        # Clean up this project only
#   ./scripts/cleanup-dev.sh --all  # Clean up all dev-server instances
set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_DIR="$(dirname "$SCRIPT_DIR")"

# Kill all descendant processes of a given PID (recursive)
kill_descendants() {
    local pid=$1
    local signal=${2:-9}
    local children
    children=$(pgrep -P "$pid" 2>/dev/null || true)
    for child in $children; do
        kill_descendants "$child" "$signal"
    done
    kill -"$signal" "$pid" 2>/dev/null || true
}

# Clean up a single dev server instance by its hash
cleanup_instance() {
    local hash=$1
    local lockfile="/tmp/dev-server-${hash}.lock"
    local pidfile="/tmp/dev-server-${hash}.pid"
    local pathfile="/tmp/dev-server-${hash}.path"

    local project_path="unknown"
    [ -f "$pathfile" ] && project_path=$(cat "$pathfile")

    if [ -f "$pidfile" ]; then
        local pid
        pid=$(cat "$pidfile")
        if kill -0 "$pid" 2>/dev/null; then
            echo "Killing dev server (PID: $pid) for: $project_path"
            kill_descendants "$pid" TERM
            sleep 1
            kill_descendants "$pid" 9
        else
            echo "Stale pidfile for: $project_path (process not running)"
        fi
    fi

    # Clean up docker compose if we know the project path
    if [ -d "$project_path/.devcontainer" ]; then
        echo "Stopping docker compose in: $project_path"
        for compose_file in "$project_path/.devcontainer"/docker-compose*.yml; do
            if [ -f "$compose_file" ]; then
                docker compose -f "$compose_file" down 2>/dev/null || true
            fi
        done
    fi

    # Remove temp files
    rm -f "$lockfile" "$pidfile" "$pathfile" 2>/dev/null || true
}

echo "Cleaning up dev server processes..."

if [ "${1:-}" = "--all" ]; then
    # Clean up ALL dev-server instances
    echo "Cleaning up all dev-server instances..."
    for pidfile in /tmp/dev-server-*.pid; do
        [ -f "$pidfile" ] || continue
        hash=$(basename "$pidfile" | sed 's/dev-server-//' | sed 's/\.pid//')
        cleanup_instance "$hash"
    done
else
    # Clean up only this project
    PROJECT_HASH=$(echo "$APP_DIR" | md5sum | cut -c1-8)
    cleanup_instance "$PROJECT_HASH"
fi

# Show status
echo ""
echo "Cleanup complete"
echo ""
echo "Active dev-server instances:"
found_any=false
for pidfile in /tmp/dev-server-*.pid; do
    [ -f "$pidfile" ] || continue
    pid=$(cat "$pidfile")
    hash=$(basename "$pidfile" | sed 's/dev-server-//' | sed 's/\.pid//')
    pathfile="/tmp/dev-server-${hash}.path"
    path="unknown"
    [ -f "$pathfile" ] && path=$(cat "$pathfile")
    if kill -0 "$pid" 2>/dev/null; then
        echo "  PID $pid: $path"
        found_any=true
    fi
done
if [ "$found_any" = false ]; then
    echo "  (none)"
fi
