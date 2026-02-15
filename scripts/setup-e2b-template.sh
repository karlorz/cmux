#!/bin/bash
set -e

# E2B Template Setup Script for cmux
# Creates a cmux-lite template with full devbox services under your E2B account
#
# Prerequisites:
#   - E2B account (https://e2b.dev/auth/sign-up)
#   - E2B_API_KEY in .env or environment
#
# Usage:
#   ./scripts/setup-e2b-template.sh
#   ./scripts/setup-e2b-template.sh --skip-test    # Skip sandbox test after build

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLOUDROUTER_DIR="$PROJECT_ROOT/packages/cloudrouter"

SKIP_TEST=false
for arg in "$@"; do
  case $arg in
    --skip-test)
      SKIP_TEST=true
      shift
      ;;
  esac
done

echo "E2B Template Setup for cmux"
echo "==========================="
echo ""

# Load .env if exists
if [ -f "$PROJECT_ROOT/.env" ]; then
  export $(grep -E "^E2B_API_KEY=" "$PROJECT_ROOT/.env" | xargs)
fi

# Check API key
if [ -z "$E2B_API_KEY" ]; then
  echo "ERROR: E2B_API_KEY not found"
  echo ""
  echo "Please set E2B_API_KEY in .env or environment:"
  echo "  1. Sign up at https://e2b.dev/auth/sign-up"
  echo "  2. Get API key from https://e2b.dev/dashboard"
  echo "  3. Add to .env: E2B_API_KEY=e2b_xxx"
  exit 1
fi

echo "API Key: ${E2B_API_KEY:0:10}..."
echo ""

# Check for required tools
check_tool() {
  if ! command -v "$1" &> /dev/null; then
    echo "ERROR: $1 not found"
    echo "Install with: $2"
    exit 1
  fi
}

check_tool "node" "brew install node"
check_tool "bun" "curl -fsSL https://bun.sh/install | bash"

# Install E2B CLI if needed
if ! command -v e2b &> /dev/null; then
  echo "Installing E2B CLI..."
  npm install -g @e2b/cli 2>&1 | grep -v "^npm warn"
  echo ""
fi

echo "E2B CLI version: $(e2b --version)"
echo ""

# Check if already logged in or login
echo "Checking E2B auth..."
if ! e2b auth info &> /dev/null; then
  echo "Not logged in. Please run: e2b auth login"
  echo "Then re-run this script."
  exit 1
fi
e2b auth info
echo ""

# Remove any existing E2B_TEMPLATE_ID from .env (we'll add the new one)
if grep -q "^E2B_TEMPLATE_ID=" "$PROJECT_ROOT/.env" 2>/dev/null; then
  echo "Removing existing E2B_TEMPLATE_ID from .env..."
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' '/^E2B_TEMPLATE_ID=/d' "$PROJECT_ROOT/.env"
    sed -i '' '/^# E2B Template ID/d' "$PROJECT_ROOT/.env"
  else
    sed -i '/^E2B_TEMPLATE_ID=/d' "$PROJECT_ROOT/.env"
    sed -i '/^# E2B Template ID/d' "$PROJECT_ROOT/.env"
  fi
fi

# Build the template using E2B CLI with Dockerfile
echo "Building E2B template from Dockerfile..."
echo "This builds a devbox with:"
echo "  - VSCode (cmux-code) on port 39378"
echo "  - Worker daemon on port 39377"
echo "  - VNC (noVNC) on port 39380"
echo "  - Chrome CDP on port 9222"
echo "  - Node.js, Bun, Rust, Git, GitHub CLI"
echo ""
echo "Resource requirements: 4 vCPU / 8 GB RAM"
echo "Build time: ~5-10 minutes"
echo ""

cd "$CLOUDROUTER_DIR"

# Use the e2b.lite.toml config (devbox without Docker/Jupyter for lower resources)
BUILD_OUTPUT=$(e2b template build \
  --config e2b.lite.toml \
  --name cmux-lite \
  2>&1)

echo "$BUILD_OUTPUT"

# Extract template ID from output
TEMPLATE_ID=$(echo "$BUILD_OUTPUT" | grep -oE "Template ID: [a-z0-9]+" | tail -1 | cut -d' ' -f3)

if [ -z "$TEMPLATE_ID" ]; then
  # Try alternate pattern
  TEMPLATE_ID=$(echo "$BUILD_OUTPUT" | grep -oE "[a-z0-9]{20}" | tail -1)
fi

if [ -z "$TEMPLATE_ID" ]; then
  echo ""
  echo "ERROR: Failed to extract template ID from build output"
  echo "Please check the build output above for errors"
  exit 1
fi

echo ""
echo "==========================="
echo "Template ID: $TEMPLATE_ID"
echo "Template Name: cmux-lite"
echo "==========================="
echo ""

# Update e2b-templates.json
echo "Updating e2b-templates.json..."
TEMPLATES_JSON="$PROJECT_ROOT/packages/shared/src/e2b-templates.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Use node to update JSON properly
node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('$TEMPLATES_JSON', 'utf8'));

// Update timestamp
json.updatedAt = '$TIMESTAMP';

// Find or create cmux-lite template
let liteTemplate = json.templates.find(t => t.templateId === 'cmux-lite');
if (liteTemplate) {
  // Add new version
  const maxVersion = Math.max(...liteTemplate.versions.map(v => v.version), 0);
  liteTemplate.versions.push({
    version: maxVersion + 1,
    e2bTemplateId: '$TEMPLATE_ID',
    capturedAt: '$TIMESTAMP'
  });
  console.log('Added new version', maxVersion + 1, 'to cmux-lite');
} else {
  // Create new template entry
  json.templates.unshift({
    templateId: 'cmux-lite',
    label: 'Lite (2 vCPU / 512 MB - Free Tier)',
    cpu: '2 vCPU',
    memory: '512 MB RAM',
    disk: '1 GB SSD',
    versions: [{
      version: 1,
      e2bTemplateId: '$TEMPLATE_ID',
      capturedAt: '$TIMESTAMP'
    }],
    description: 'Full devbox with VSCode, VNC, Chrome CDP, JupyterLab, Docker. Free tier compatible.'
  });
  console.log('Created new cmux-lite template');
}

fs.writeFileSync('$TEMPLATES_JSON', JSON.stringify(json, null, 2) + '\n');
console.log('Updated', '$TEMPLATES_JSON');
"

# Update e2b-client default
echo "Updating e2b-client default template ID..."
E2B_CLIENT="$PROJECT_ROOT/packages/e2b-client/src/index.ts"
if [[ "$OSTYPE" == "darwin"* ]]; then
  sed -i '' "s/CMUX_DEVBOX_TEMPLATE_ID = \"[^\"]*\"/CMUX_DEVBOX_TEMPLATE_ID = \"$TEMPLATE_ID\"/" "$E2B_CLIENT"
else
  sed -i "s/CMUX_DEVBOX_TEMPLATE_ID = \"[^\"]*\"/CMUX_DEVBOX_TEMPLATE_ID = \"$TEMPLATE_ID\"/" "$E2B_CLIENT"
fi

echo ""
echo "Setup complete!"
echo ""
echo "Template ID: $TEMPLATE_ID"
echo ""
echo "Next steps:"
echo "  1. Restart dev server: make dev"
echo "  2. Test with: cloudrouter start --provider e2b"
echo ""
echo "The cmux-lite template now includes full devbox services."
