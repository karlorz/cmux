#!/usr/bin/env bash
# Build script for E2B Lite Template
# Usage: ./scripts/setup-e2b-template-lite.sh [--prod|--dev]
#
# This creates a lightweight E2B template WITHOUT Docker-in-Docker.
# Useful for tasks that don't require running containers inside the sandbox.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Parse arguments
BUILD_MODE="dev"
while [[ $# -gt 0 ]]; do
    case $1 in
        --prod)
            BUILD_MODE="prod"
            shift
            ;;
        --dev)
            BUILD_MODE="dev"
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [--prod|--dev]"
            echo ""
            echo "Options:"
            echo "  --dev   Build template in development mode (default)"
            echo "  --prod  Build template in production mode"
            echo ""
            echo "This script builds the cmux-devbox-lite E2B template."
            echo "The lite template does NOT include Docker-in-Docker, making it:"
            echo "  - Faster to boot"
            echo "  - Smaller image size"
            echo "  - Lower resource overhead"
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            exit 1
            ;;
    esac
done

log_info "Building E2B Lite Template (mode: $BUILD_MODE)"

# Check for required tools
if ! command -v bun &> /dev/null; then
    log_error "bun is not installed. Please install bun first."
    exit 1
fi

if ! command -v e2b &> /dev/null; then
    log_warn "E2B CLI not found, will use bunx e2b"
    E2B_CMD="bunx e2b"
else
    E2B_CMD="e2b"
fi

# Navigate to cmux-devbox-lite package
cd "$PROJECT_ROOT/packages/cloudrouter/cmux-devbox-lite"

log_info "Installing dependencies..."
bun install

log_info "Building template with SDK v2..."
if [ "$BUILD_MODE" = "prod" ]; then
    bun run build:prod
else
    bun run build:dev
fi

log_success "E2B Lite Template build complete!"
log_info ""
log_info "Template Details:"
log_info "  - Name: cmux-devbox-lite"
log_info "  - Features: VSCode, VNC, JupyterLab, Worker Daemon"
log_info "  - Excludes: Docker-in-Docker"
log_info ""
log_info "To use this template:"
log_info "  cloudrouter start --template cmux-devbox-lite"
log_info ""
log_info "Or set as default in Convex:"
log_info "  Update packages/shared/src/e2b-templates.ts DEFAULT_E2B_SIZE_TIER to 'lite'"
