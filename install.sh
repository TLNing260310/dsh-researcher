#!/usr/bin/env bash
# dsh-researcher installer (bash)
# Copies the `researcher` preset into ${DSH_HOME:-$HOME/.dsh}/.agent-presets/

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRESET_SOURCE="$SCRIPT_DIR/researcher"
if [ ! -f "$PRESET_SOURCE/agent.cordis.yml" ]; then
  echo "preset source not found at $PRESET_SOURCE (run from the repository root)" >&2
  exit 1
fi

DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
TARGET_ROOT="$DSH_HOME_DIR/.agent-presets"
TARGET="$TARGET_ROOT/researcher"

if [ -e "$TARGET" ]; then
  echo "target preset already exists: $TARGET (back it up and remove it first)" >&2
  exit 1
fi

mkdir -p "$TARGET_ROOT"
cp -R "$PRESET_SOURCE" "$TARGET"

echo ""
echo "Installed 'researcher' preset to $TARGET"
echo "Next steps:"
echo "  1. Start dsh, create a new session with preset '项目研究 Project Research'."
echo "  2. Choose permission read-only, approval never (custom combination)."
echo "  3. Verify: write/edit show as 'DISABLED in research mode' stubs;"
echo "     run 'git status --porcelain' before and after the session - identical."
