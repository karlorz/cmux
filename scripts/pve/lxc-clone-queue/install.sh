#!/bin/bash
# install.sh - Install lxc-clone-queue on PVE host
#
# This script:
#   1. Downloads and builds the Go binary (or downloads pre-built)
#   2. Installs systemd service
#   3. Updates Caddy configuration to route clone requests
#   4. Starts the service
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/karlorz/cmux/main/scripts/pve/lxc-clone-queue/install.sh | bash
#
# Or with options:
#   ./install.sh --build-from-source
#   ./install.sh --uninstall

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $*"; }
log_success() { echo -e "${GREEN}[OK]${NC} $*"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error() { echo -e "${RED}[ERROR]${NC} $*"; }

# Configuration
INSTALL_DIR="/usr/local/bin"
SERVICE_FILE="/etc/systemd/system/lxc-clone-queue.service"
CADDY_SNIPPET="/etc/caddy/conf.d/lxc-clone-queue.caddyfile"
DEFAULT_FILE="/etc/default/lxc-clone-queue"
GITHUB_REPO="karlorz/cmux"
BRANCH="main"
BUILD_FROM_SOURCE=false
UNINSTALL=false

usage() {
    cat << EOF
Usage: $(basename "$0") [OPTIONS]

Install lxc-clone-queue service on PVE host.

Options:
  --build-from-source    Build from source instead of downloading pre-built binary
  --uninstall            Remove the service and configuration
  -h, --help             Show this help

The service serializes LXC clone requests to prevent lock conflicts
when multiple containers are cloned from the same template simultaneously.
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case "$1" in
        --build-from-source)
            BUILD_FROM_SOURCE=true
            shift
            ;;
        --uninstall)
            UNINSTALL=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        log_error "This script must be run as root"
        exit 1
    fi
}

# Check if running on PVE
check_pve() {
    if ! command -v pveversion &>/dev/null; then
        log_error "This script must be run on a Proxmox VE host"
        exit 1
    fi
    log_info "Detected PVE version: $(pveversion --version 2>/dev/null | head -1 || echo 'unknown')"
}

# Uninstall function
do_uninstall() {
    log_info "Uninstalling lxc-clone-queue..."

    # Stop and disable service
    if systemctl is-active lxc-clone-queue &>/dev/null; then
        systemctl stop lxc-clone-queue
    fi
    if systemctl is-enabled lxc-clone-queue &>/dev/null; then
        systemctl disable lxc-clone-queue
    fi

    # Remove files
    rm -f "$INSTALL_DIR/lxc-clone-queue"
    rm -f "$SERVICE_FILE"
    rm -f "$CADDY_SNIPPET"
    rm -f "$DEFAULT_FILE"

    systemctl daemon-reload

    log_success "lxc-clone-queue uninstalled"
    log_warn "Note: You may need to manually update your main Caddyfile if you included the snippet"
}

# Build from source
build_from_source() {
    log_info "Building from source..."

    # Check for Go
    if ! command -v go &>/dev/null; then
        log_info "Installing Go..."
        GO_VERSION="1.23.4"
        curl -fsSL "https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz" | tar -C /usr/local -xzf -
        export PATH="/usr/local/go/bin:$PATH"
    fi

    # Create temp build directory
    BUILD_DIR=$(mktemp -d)
    cd "$BUILD_DIR"

    # Download source
    log_info "Downloading source code..."
    curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/scripts/pve/lxc-clone-queue/main.go" -o main.go
    curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/${BRANCH}/scripts/pve/lxc-clone-queue/go.mod" -o go.mod

    # Build
    log_info "Compiling..."
    CGO_ENABLED=0 go build -ldflags="-s -w" -o lxc-clone-queue .

    # Install binary
    mv lxc-clone-queue "$INSTALL_DIR/lxc-clone-queue"
    chmod +x "$INSTALL_DIR/lxc-clone-queue"

    # Cleanup
    cd /
    rm -rf "$BUILD_DIR"

    log_success "Built and installed to $INSTALL_DIR/lxc-clone-queue"
}

# Download pre-built binary (placeholder - would need actual releases)
download_binary() {
    # For now, always build from source since we don't have releases yet
    log_info "No pre-built binary available, building from source..."
    build_from_source
}

# Install systemd service
install_service() {
    log_info "Installing systemd service..."

    # Download or create service file
    cat > "$SERVICE_FILE" << 'EOF'
[Unit]
Description=LXC Clone Queue - PVE clone request serialization proxy
Documentation=https://github.com/manaflow-ai/cmux
After=network-online.target pve-cluster.service pvedaemon.service
Wants=network-online.target
Requires=pvedaemon.service

[Service]
Type=simple
ExecStart=/usr/local/bin/lxc-clone-queue \
    -listen :8081 \
    -pve-addr https://127.0.0.1:8006 \
    -max-retries 5 \
    -task-poll-interval 2s \
    -task-timeout 5m \
    -request-timeout 10m \
    -insecure-tls=true

Restart=on-failure
RestartSec=5
TimeoutStartSec=10
TimeoutStopSec=10

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
PrivateDevices=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictAddressFamilies=AF_INET AF_INET6
RestrictNamespaces=true
RestrictRealtime=true
RestrictSUIDSGID=true

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=lxc-clone-queue

# Environment (can be overridden in /etc/default/lxc-clone-queue)
EnvironmentFile=-/etc/default/lxc-clone-queue

[Install]
WantedBy=multi-user.target
EOF

    # Create default config file
    if [[ ! -f "$DEFAULT_FILE" ]]; then
        cat > "$DEFAULT_FILE" << 'EOF'
# lxc-clone-queue configuration
# Uncomment and modify as needed

# LISTEN_ADDR=:8081
# PVE_API_ADDR=https://127.0.0.1:8006
# MAX_RETRIES=5
EOF
    fi

    systemctl daemon-reload
    systemctl enable lxc-clone-queue
    systemctl start lxc-clone-queue

    log_success "Service installed and started"
}

# Create Caddy configuration snippet
create_caddy_snippet() {
    log_info "Creating Caddy configuration snippet..."

    mkdir -p "$(dirname "$CADDY_SNIPPET")"

    cat > "$CADDY_SNIPPET" << 'EOF'
# lxc-clone-queue - Route LXC clone requests to serialization proxy
#
# Include this in your main Caddyfile with:
#   import /etc/caddy/conf.d/lxc-clone-queue.caddyfile
#
# Or add this route block directly to your PVE reverse proxy site.

# Route clone requests to the queue service
@lxc_clone {
    method POST
    path_regexp ^/api2/json/nodes/[^/]+/lxc/\d+/clone$
}
handle @lxc_clone {
    reverse_proxy localhost:8081 {
        # Long timeout for clone operations (may queue)
        transport http {
            dial_timeout 30s
            response_header_timeout 15m
        }
        # Don't retry at Caddy level - the queue service handles retries
        lb_try_duration 0
    }
}
EOF

    log_success "Caddy snippet created at $CADDY_SNIPPET"

    # Check if main Caddyfile exists and suggest inclusion
    if [[ -f /etc/caddy/Caddyfile.cmux ]]; then
        log_info "Found existing cmux Caddyfile. To enable, add this line inside your PVE site block:"
        echo ""
        echo "    import /etc/caddy/conf.d/lxc-clone-queue.caddyfile"
        echo ""
        echo "Then reload Caddy: systemctl reload caddy-cmux"
    fi
}

# Verify installation
verify_install() {
    log_info "Verifying installation..."

    # Check service status
    if systemctl is-active lxc-clone-queue &>/dev/null; then
        log_success "Service is running"
    else
        log_error "Service failed to start"
        journalctl -u lxc-clone-queue -n 20 --no-pager
        exit 1
    fi

    # Check health endpoint
    sleep 2
    if curl -s http://localhost:8081/healthz | grep -q '"status":"ok"'; then
        log_success "Health check passed"
    else
        log_warn "Health check failed (service may still be starting)"
    fi
}

# Print summary
print_summary() {
    echo ""
    echo "======================================"
    echo "  lxc-clone-queue Installation Complete"
    echo "======================================"
    echo ""
    echo "Service status: $(systemctl is-active lxc-clone-queue)"
    echo "Listening on: http://localhost:8081"
    echo ""
    echo "Endpoints:"
    echo "  /healthz - Health check"
    echo "  /stats   - Queue statistics"
    echo ""
    echo "Next steps:"
    echo "1. Update your Caddyfile to route clone requests to port 8081"
    echo "   Add this inside your PVE API reverse proxy block:"
    echo ""
    echo "   import /etc/caddy/conf.d/lxc-clone-queue.caddyfile"
    echo ""
    echo "2. Reload Caddy:"
    echo "   systemctl reload caddy-cmux"
    echo ""
    echo "Logs: journalctl -u lxc-clone-queue -f"
    echo ""
}

# Main
main() {
    check_root

    if [[ "$UNINSTALL" == "true" ]]; then
        do_uninstall
        exit 0
    fi

    check_pve

    echo ""
    echo "======================================"
    echo "  lxc-clone-queue Installer"
    echo "======================================"
    echo ""

    if [[ "$BUILD_FROM_SOURCE" == "true" ]]; then
        build_from_source
    else
        download_binary
    fi

    install_service
    create_caddy_snippet
    verify_install
    print_summary
}

main "$@"
