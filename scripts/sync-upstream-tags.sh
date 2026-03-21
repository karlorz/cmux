#!/usr/bin/env bash
set -euo pipefail

exec bun ./scripts/sync-upstream-tags.ts "$@"
