#!/bin/bash
set -e

# E2B Template Setup Script for cmux (Lite version)
# Builds cmux-devbox-lite template using E2B SDK v2
#
# For full devbox with Docker, use: ./scripts/setup-e2b-template.sh
#
# Prerequisites:
#   - E2B account (https://e2b.dev/auth/sign-up)
#   - E2B_API_KEY in .env or environment
#
# Usage:
#   ./scripts/setup-e2b-template-lite.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TEMPLATE_DIR="$PROJECT_ROOT/packages/cloudrouter/cmux-devbox-lite"

TEMPLATE_NAME="cmux-devbox-lite"

echo "E2B Template Setup: $TEMPLATE_NAME"
echo "==================================="
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

# Build the template
echo "Building E2B template using SDK v2..."
echo "This builds a devbox with:"
echo "  - VSCode (cmux-code) on port 39378"
echo "  - Worker daemon on port 39377"
echo "  - VNC (noVNC) on port 39380"
echo "  - Chrome CDP on port 9222"
echo "  - Node.js, Bun, Rust, Git, GitHub CLI"
echo ""
echo "Resources: 4 vCPU / 8 GB RAM"
echo "Build time: ~5-10 minutes"
echo ""

# Symlink .env if needed
ln -sf ../../../.env "$TEMPLATE_DIR/.env" 2>/dev/null || true

# Install dependencies
echo "Installing dependencies..."
cd "$TEMPLATE_DIR"
npm install --silent 2>&1 | grep -v "^npm warn" || true
echo ""

# Build template
echo "Building template..."
BUILD_OUTPUT=$(npm run e2b:build:prod 2>&1)
echo "$BUILD_OUTPUT" | grep -v "^>" | grep -v "^$"

# Extract template ID
TEMPLATE_ID=$(echo "$BUILD_OUTPUT" | grep "__TEMPLATE_ID__=" | cut -d'=' -f2)

if [ -z "$TEMPLATE_ID" ]; then
  echo ""
  echo "ERROR: Failed to extract template ID from build output"
  exit 1
fi

echo ""
echo "==================================="
echo "Template ID: $TEMPLATE_ID"
echo "Template Name: $TEMPLATE_NAME"
echo "==================================="
echo ""

# Update e2b-templates.json
echo "Updating e2b-templates.json..."
TEMPLATES_JSON="$PROJECT_ROOT/packages/shared/src/e2b-templates.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

node -e "
const fs = require('fs');
const json = JSON.parse(fs.readFileSync('$TEMPLATES_JSON', 'utf8'));

json.updatedAt = '$TIMESTAMP';

let template = json.templates.find(t => t.templateId === '$TEMPLATE_NAME');
if (template) {
  const maxVersion = Math.max(...template.versions.map(v => v.version), 0);
  template.versions.push({
    version: maxVersion + 1,
    e2bTemplateId: '$TEMPLATE_ID',
    capturedAt: '$TIMESTAMP'
  });
  console.log('Added version', maxVersion + 1, 'to $TEMPLATE_NAME');
} else {
  json.templates.unshift({
    templateId: '$TEMPLATE_NAME',
    label: 'Lite (4 vCPU / 8 GB)',
    cpu: '4 vCPU',
    memory: '8 GB RAM',
    disk: '10 GB SSD',
    versions: [{
      version: 1,
      e2bTemplateId: '$TEMPLATE_ID',
      capturedAt: '$TIMESTAMP'
    }],
    description: 'Devbox with VSCode, VNC, Chrome CDP. Lower resource usage than full devbox.'
  });
  console.log('Created $TEMPLATE_NAME template');
}

fs.writeFileSync('$TEMPLATES_JSON', JSON.stringify(json, null, 2) + '\n');
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
