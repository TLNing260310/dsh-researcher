#!/usr/bin/env bash
# dsh-researcher lifecycle wrapper (Bash)
# The Node entry point is the single implementation for install, --dry-run,
# backup, uninstall, rollback, and strict DSH compatibility checks.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENTRY="$SCRIPT_DIR/bin/install.js"
if [ ! -f "$ENTRY" ]; then
  echo "installer entry point not found at $ENTRY" >&2
  exit 1
fi

exec node "$ENTRY" "$@"
