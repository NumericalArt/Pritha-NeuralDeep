#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
export TECHSCOPE_ROOT="${TECHSCOPE_ROOT:-${SCRIPT_DIR:h}}"
cd "$TECHSCOPE_ROOT"

export HOST="${HOST:-100.85.19.71}"
export PORT="${PORT:-3000}"
export PATH="/Applications/Codex.app/Contents/Resources:${HOME}/Library/Python/3.9/bin:${HOME}/.local/bin:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin"

echo "$(date '+%Y-%m-%dT%H:%M:%S%z') starting Techscope Web"
exec /usr/bin/python3 scripts/techscope_web.py
