#!/usr/bin/env bash
# dsh-researcher installer (bash)
# Installs the researcher + governed presets and their portable core.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRESET_SOURCE="$SCRIPT_DIR/researcher"
GOVERNED_SOURCE="$SCRIPT_DIR/governed"
if [ ! -f "$PRESET_SOURCE/agent.cordis.yml" ]; then
  echo "preset source not found at $PRESET_SOURCE (run from the repository root)" >&2
  exit 1
fi
if [ ! -f "$GOVERNED_SOURCE/agent.cordis.yml" ]; then
  echo "preset source not found at $GOVERNED_SOURCE" >&2
  exit 1
fi

DSH_HOME_DIR="${DSH_HOME:-$HOME/.dsh}"
TARGET_ROOT="$DSH_HOME_DIR/.agent-presets"
TARGET="$TARGET_ROOT/researcher"
GOVERNED_TARGET="$TARGET_ROOT/governed"

# Version preflight: verified against DeepSeek Harness 0.1.0-rc.7.
VERIFIED_VERSION="0.1.0-rc.7"
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

if [ -e "$TARGET" ] || [ -e "$GOVERNED_TARGET" ]; then
  echo "target preset already exists: $TARGET or $GOVERNED_TARGET (back it up and remove it first)" >&2
  exit 1
fi

mkdir -p "$TARGET_ROOT"
cp -R "$PRESET_SOURCE" "$TARGET"
cp -R "$GOVERNED_SOURCE" "$GOVERNED_TARGET"
mkdir -p "$TARGET/project-cognition"
cp -R "$SCRIPT_DIR/lib" "$TARGET/project-cognition/lib"
cp -R "$SCRIPT_DIR/schemas" "$TARGET/project-cognition/schemas"

echo ""
echo "Installed 'researcher' preset to $TARGET"
echo "Installed 'governed' preset to $GOVERNED_TARGET"
echo "Next steps:"
echo "  1. Certified research: choose '项目研究 Project Research', read-only + approval never."
echo "  2. Governed execution: choose '目标治理编码 Governed Coding', then /researcher run <contract>."
echo "  3. /researcher <question> starts one guarded read-only turn in Governed Coding."
