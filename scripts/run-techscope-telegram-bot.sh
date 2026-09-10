#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:a:h}"
export TECHSCOPE_ROOT="${TECHSCOPE_ROOT:-${SCRIPT_DIR:h}}"
cd "$TECHSCOPE_ROOT"

exec /usr/bin/env node scripts/telegram-bot.mjs poll
