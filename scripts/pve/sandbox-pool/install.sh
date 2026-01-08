#!/bin/bash
#
# PVE Sandbox Pool Service - Installation Script
#
# This script installs and configures the sandbox pool service on a Proxmox VE host.
# It sets up Python virtual environment, systemd service, and optionally configures Caddy.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/manaflow-ai/cmux/main/scripts/pve/sandbox-pool/install.sh | bash
#
# Or with options:
#   ./install.sh --pve-url https://pve.example.com:8006 --pve-token "root@pam!cmux=secret"
#

set -euo pipefail

# Default values
INSTALL_DIR="/opt/cmux-sandbox-pool"
SERVICE_NAME="sandbox-pool"
SERVICE_PORT="8007"
PVE_API_URL="${PVE_API_URL:-}"
PVE_API_TOKEN="${PVE_API_TOKEN:-}"
POOL_TARGET_SIZE="${POOL_TARGET_SIZE:-5}"
SKIP_CADDY="${SKIP_CADDY:-false}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --pve-url)
            PVE_API_URL="$2"
            shift 2
            ;;
        --pve-token)
            PVE_API_TOKEN="$2"
            shift 2
            ;;
        --pool-size)
            POOL_TARGET_SIZE="$2"
            shift 2
            ;;
        --install-dir)
            INSTALL_DIR="$2"
            shift 2
            ;;
        --skip-caddy)
            SKIP_CADDY="true"
            shift
            ;;
        --help)
            cat <<EOF
PVE Sandbox Pool Service - Installation Script

Usage: $0 [OPTIONS]

Options:
  --pve-url URL       PVE API URL (e.g., https://pve.example.com:8006)
  --pve-token TOKEN   PVE API token (format: user@realm!tokenid=secret)
  --pool-size N       Target pool size per template (default: 5)
  --install-dir DIR   Installation directory (default: /opt/cmux-sandbox-pool)
  --skip-caddy        Skip Caddy configuration
  --help              Show this help message

Environment variables:
  PVE_API_URL         Same as --pve-url
  PVE_API_TOKEN       Same as --pve-token
  POOL_TARGET_SIZE    Same as --pool-size
EOF
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    log_error "This script must be run as root"
    exit 1
fi

# Check if on a PVE host
if ! command -v pveversion &> /dev/null; then
    log_warn "pveversion not found - this may not be a Proxmox VE host"
    read -p "Continue anyway? [y/N] " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Prompt for required values if not provided
if [[ -z "$PVE_API_URL" ]]; then
    # Try to auto-detect from PVE
    HOSTNAME=$(hostname -f 2>/dev/null || hostname)
    DEFAULT_URL="https://${HOSTNAME}:8006"
    read -p "PVE API URL [${DEFAULT_URL}]: " PVE_API_URL
    PVE_API_URL="${PVE_API_URL:-$DEFAULT_URL}"
fi

if [[ -z "$PVE_API_TOKEN" ]]; then
    log_info "Creating PVE API token for sandbox-pool service..."

    # Check if token already exists
    if pveum user token list root@pam 2>/dev/null | grep -q "cmux-pool"; then
        log_warn "Token 'cmux-pool' already exists for root@pam"
        read -p "Enter existing token secret or press Enter to regenerate: " TOKEN_SECRET

        if [[ -z "$TOKEN_SECRET" ]]; then
            # Remove and recreate token
            pveum user token remove root@pam cmux-pool 2>/dev/null || true
            TOKEN_OUTPUT=$(pveum user token add root@pam cmux-pool --privsep 0)
            TOKEN_SECRET=$(echo "$TOKEN_OUTPUT" | grep "value" | awk '{print $2}')
        fi
    else
        # Create new token
        TOKEN_OUTPUT=$(pveum user token add root@pam cmux-pool --privsep 0)
        TOKEN_SECRET=$(echo "$TOKEN_OUTPUT" | grep "value" | awk '{print $2}')
    fi

    PVE_API_TOKEN="root@pam!cmux-pool=${TOKEN_SECRET}"
    log_info "Token created: root@pam!cmux-pool"
fi

log_info "Installing sandbox pool service..."

# Install Python if not present
if ! command -v python3 &> /dev/null; then
    log_info "Installing Python 3..."
    apt-get update
    apt-get install -y python3 python3-venv python3-pip
fi

# Create installation directory
log_info "Creating installation directory: ${INSTALL_DIR}"
mkdir -p "${INSTALL_DIR}"

# Download service files
log_info "Downloading service files..."
REPO_URL="https://raw.githubusercontent.com/manaflow-ai/cmux/main/scripts/pve/sandbox-pool"

# If running from local repo, copy files instead
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "${SCRIPT_DIR}/pool_service.py" ]]; then
    log_info "Using local files from ${SCRIPT_DIR}"
    cp "${SCRIPT_DIR}/pool_service.py" "${INSTALL_DIR}/"
    cp "${SCRIPT_DIR}/requirements.txt" "${INSTALL_DIR}/"
else
    curl -fsSL "${REPO_URL}/pool_service.py" -o "${INSTALL_DIR}/pool_service.py"
    curl -fsSL "${REPO_URL}/requirements.txt" -o "${INSTALL_DIR}/requirements.txt"
fi

# Create Python virtual environment
log_info "Creating Python virtual environment..."
python3 -m venv "${INSTALL_DIR}/.venv"
source "${INSTALL_DIR}/.venv/bin/activate"

# Install dependencies
log_info "Installing Python dependencies..."
pip install --upgrade pip
pip install -r "${INSTALL_DIR}/requirements.txt"

deactivate

# Create environment file
log_info "Creating environment configuration..."
cat > "${INSTALL_DIR}/.env" <<EOF
# PVE Sandbox Pool Service Configuration
# Generated by install.sh on $(date -Iseconds)

# PVE API Connection
PVE_API_URL=${PVE_API_URL}
PVE_API_TOKEN=${PVE_API_TOKEN}

# Pool Settings
POOL_TARGET_SIZE=${POOL_TARGET_SIZE}
POOL_MIN_SIZE=3
POOL_MAX_SIZE=10

# Replenishment
REPLENISH_INTERVAL_SECONDS=30
REPLENISH_BATCH_SIZE=1

# Container Settings
CONTAINER_HOSTNAME_PREFIX=pool-
CONTAINER_VMID_START=200

# Clone Retry
CLONE_MAX_RETRIES=3
CLONE_RETRY_DELAY_SECONDS=5
CLONE_RETRY_JITTER_SECONDS=2
EOF

chmod 600 "${INSTALL_DIR}/.env"

# Install systemd service
log_info "Installing systemd service..."
cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=PVE Sandbox Pool Service
Documentation=https://github.com/manaflow-ai/cmux
After=network.target pve-cluster.service

[Service]
Type=simple
User=root
Group=root
WorkingDirectory=${INSTALL_DIR}

# Load environment from file
EnvironmentFile=${INSTALL_DIR}/.env

# Run the service
ExecStart=${INSTALL_DIR}/.venv/bin/uvicorn pool_service:app --host 127.0.0.1 --port ${SERVICE_PORT}

# Restart policy
Restart=always
RestartSec=5
StartLimitIntervalSec=60
StartLimitBurst=3

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=${INSTALL_DIR}

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=${SERVICE_NAME}

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

# Configure Caddy if available and not skipped
if [[ "$SKIP_CADDY" != "true" ]] && command -v caddy &> /dev/null; then
    log_info "Caddy detected. Configuring pool route..."

    CADDY_CONFIG="/etc/caddy/Caddyfile"
    if [[ -f "$CADDY_CONFIG" ]]; then
        # Check if pool route already exists
        if grep -q "/pool/" "$CADDY_CONFIG"; then
            log_warn "Pool route already exists in Caddy config"
        else
            log_info "Adding pool route to Caddy config..."
            # Create backup
            cp "$CADDY_CONFIG" "${CADDY_CONFIG}.bak.$(date +%Y%m%d%H%M%S)"

            cat >> "$CADDY_CONFIG" <<EOF

# PVE Sandbox Pool Service (added by sandbox-pool install.sh)
# Route /pool/* to the local pool service
# Add this to your main site block's handle section:
#   handle /pool/* {
#       uri strip_prefix /pool
#       reverse_proxy 127.0.0.1:${SERVICE_PORT}
#   }
EOF
            log_warn "Caddy config updated. Please review and restart Caddy manually."
        fi
    else
        log_warn "Caddy config not found at ${CADDY_CONFIG}"
    fi
else
    log_info "Skipping Caddy configuration"
fi

# Start the service
log_info "Starting ${SERVICE_NAME} service..."
systemctl start "${SERVICE_NAME}"

# Wait a moment and check status
sleep 2
if systemctl is-active --quiet "${SERVICE_NAME}"; then
    log_info "Service started successfully"
else
    log_error "Service failed to start. Check logs with: journalctl -u ${SERVICE_NAME}"
    systemctl status "${SERVICE_NAME}" --no-pager || true
    exit 1
fi

# Test the service
log_info "Testing service health..."
if curl -sf "http://127.0.0.1:${SERVICE_PORT}/health" > /dev/null; then
    log_info "Health check passed"
else
    log_warn "Health check failed - service may still be starting"
fi

# Print summary
echo ""
echo "=============================================="
echo "  PVE Sandbox Pool Service - Installed"
echo "=============================================="
echo ""
echo "Installation directory: ${INSTALL_DIR}"
echo "Service name: ${SERVICE_NAME}"
echo "Service port: ${SERVICE_PORT}"
echo ""
echo "Useful commands:"
echo "  systemctl status ${SERVICE_NAME}    # Check service status"
echo "  systemctl restart ${SERVICE_NAME}   # Restart service"
echo "  journalctl -fu ${SERVICE_NAME}      # View logs"
echo "  curl http://127.0.0.1:${SERVICE_PORT}/status  # Check pool status"
echo ""
echo "To use with cmux, set in your .env:"
echo "  PVE_POOL_URL=http://127.0.0.1:${SERVICE_PORT}"
echo ""
echo "Or if using Caddy proxy:"
echo "  PVE_POOL_URL=https://pve.example.com/pool"
echo ""
log_info "Installation complete"
