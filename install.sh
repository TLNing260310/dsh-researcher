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

# Version preflight: verified against DeepSeek Harness 0.1.0-rc.6.
VERIFIED_VERSION="0.1.0-rc.6"
if command -v dsh >/dev/null 2>&1; then
  DSH_VERSION="$(dsh --version 2>/dev/null | head -n 1)"
  if [ -z "$DSH_VERSION" ]; then
    echo "Warning: 'dsh' was found but reported no version (verified on ${VERIFIED_VERSION})."
  elif ! printf '%s' "$DSH_VERSION" | grep -qF "$VERIFIED_VERSION"; then
    echo "Warning: verified on DSH ${VERIFIED_VERSION}; you are running '${DSH_VERSION}'."
    echo "The preset's read-only guard fails closed on incompatible runtimes (STRICT mode):"
    echo "a session that cannot install its guard will refuse to start, loudly, instead of degrading silently."
  fi
else
  echo "Warning: 'dsh' not on PATH. The preset only works inside DeepSeek Harness (verified on ${VERIFIED_VERSION})."
fi

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
