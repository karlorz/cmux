#!/bin/bash
#
# check-and-simplify.sh - Dev cycle workflow script
#
# This script implements the cmux governance rule (2026-03-10):
# 1. Run `bun check` (lint + typecheck)
# 2. If check passes and there are changes, prompt for /simplify
#
# Usage:
#   ./scripts/check-and-simplify.sh [options]
#
# Options:
#   --auto          Run simplify automatically without prompting
#   --skip-simplify Skip the simplify step entirely
#   --help          Show this help message
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Parse arguments
AUTO_SIMPLIFY=false
SKIP_SIMPLIFY=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --auto)
            AUTO_SIMPLIFY=true
            shift
            ;;
        --skip-simplify)
            SKIP_SIMPLIFY=true
            shift
            ;;
        --help|-h)
            echo "Usage: ./scripts/check-and-simplify.sh [options]"
            echo ""
            echo "Options:"
            echo "  --auto          Run simplify automatically without prompting"
            echo "  --skip-simplify Skip the simplify step entirely"
            echo "  --help          Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

echo -e "${BLUE}=== cmux Dev Cycle Check ===${NC}"
echo ""

# Step 1: Run bun check
echo -e "${CYAN}Step 1: Running bun check...${NC}"
echo ""

if ! bun check; then
    echo ""
    echo -e "${RED}bun check failed.${NC}"
    echo ""
    echo "Fix the issues above and run this script again."
    exit 1
fi

echo ""
echo -e "${GREEN}bun check passed.${NC}"

# Step 2: Check for changes
echo ""
echo -e "${CYAN}Step 2: Checking for uncommitted changes...${NC}"

# Get both staged and unstaged changes
STAGED=$(git diff --cached --name-only 2>/dev/null || true)
UNSTAGED=$(git diff --name-only 2>/dev/null || true)
UNTRACKED=$(git ls-files --others --exclude-standard 2>/dev/null || true)

HAS_CHANGES=false
if [ -n "$STAGED" ] || [ -n "$UNSTAGED" ] || [ -n "$UNTRACKED" ]; then
    HAS_CHANGES=true
fi

if [ "$HAS_CHANGES" = "false" ]; then
    echo ""
    echo -e "${GREEN}No uncommitted changes. Ready to commit!${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}Changes detected:${NC}"

if [ -n "$STAGED" ]; then
    echo -e "  ${GREEN}Staged:${NC}"
    echo "$STAGED" | head -5 | sed 's/^/    /'
    STAGED_COUNT=$(echo "$STAGED" | wc -l | tr -d ' ')
    [ "$STAGED_COUNT" -gt 5 ] && echo "    ... and $((STAGED_COUNT - 5)) more"
fi

if [ -n "$UNSTAGED" ]; then
    echo -e "  ${YELLOW}Modified:${NC}"
    echo "$UNSTAGED" | head -5 | sed 's/^/    /'
    UNSTAGED_COUNT=$(echo "$UNSTAGED" | wc -l | tr -d ' ')
    [ "$UNSTAGED_COUNT" -gt 5 ] && echo "    ... and $((UNSTAGED_COUNT - 5)) more"
fi

if [ -n "$UNTRACKED" ]; then
    echo -e "  ${RED}Untracked:${NC}"
    echo "$UNTRACKED" | head -5 | sed 's/^/    /'
    UNTRACKED_COUNT=$(echo "$UNTRACKED" | wc -l | tr -d ' ')
    [ "$UNTRACKED_COUNT" -gt 5 ] && echo "    ... and $((UNTRACKED_COUNT - 5)) more"
fi

# Step 3: Suggest or run simplify
echo ""

if [ "$SKIP_SIMPLIFY" = "true" ]; then
    echo -e "${YELLOW}Skipping simplify step (--skip-simplify).${NC}"
    echo ""
    echo -e "${GREEN}Ready for commit. Run: git add -A && git commit${NC}"
    exit 0
fi

echo -e "${CYAN}Step 3: Code simplification review${NC}"
echo ""

if [ "$AUTO_SIMPLIFY" = "true" ]; then
    echo -e "${BLUE}Running /simplify automatically...${NC}"
    echo ""

    # Check if we're in Claude Code or have the skill available
    if command -v claude &> /dev/null; then
        echo "Invoking Claude Code /simplify..."
        claude --print "/simplify" || {
            echo -e "${YELLOW}Claude Code /simplify failed or not available.${NC}"
            echo "Consider running manually: /simplify"
        }
    else
        echo -e "${YELLOW}Claude Code CLI not found.${NC}"
        echo "To run simplify manually:"
        echo "  1. In Claude Code: /simplify"
        echo "  2. In Codex: Use the simplify skill from .agents/skills/simplify/"
    fi
else
    echo -e "${YELLOW}Changes detected. Consider running /simplify to review and clean up code.${NC}"
    echo ""
    echo "Options:"
    echo "  - In Claude Code: /simplify"
    echo "  - In Codex: Use the simplify skill"
    echo "  - Run this script with --auto to auto-simplify"
    echo ""

    # Interactive prompt if terminal is available
    if [ -t 0 ]; then
        read -p "Run simplify now? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            if command -v claude &> /dev/null; then
                claude --print "/simplify"
            else
                echo -e "${YELLOW}Claude Code CLI not found. Run /simplify manually.${NC}"
            fi
        fi
    fi
fi

echo ""
echo -e "${GREEN}Dev cycle check complete.${NC}"
echo ""
echo "Next steps:"
echo "  1. Review any simplify suggestions"
echo "  2. Stage changes: git add -A (or specific files)"
echo "  3. Commit: git commit -m 'your message'"
