#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
# Explicit interpreter override; never modify global Python or Homebrew packages.
PYTHON_BIN="${PYTHON_BIN:-python3}"
"$PYTHON_BIN" -c 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required; set PYTHON_BIN to an installed compatible interpreter"'
if [[ ! -x .venv-ytdlp/bin/python ]]; then
  "$PYTHON_BIN" -m venv .venv-ytdlp
fi
.venv-ytdlp/bin/python -m pip --isolated install --index-url https://pypi.org/simple -r requirements-ytdlp.lock
.venv-ytdlp/bin/yt-dlp --version
