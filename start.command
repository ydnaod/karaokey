#!/usr/bin/env bash
# karaokey — start the app

set -euo pipefail

cd "$(dirname "$0")"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }

# Make brew tools available even if the user hasn't restarted their terminal
# since running setup.command.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

missing=()
for cmd in node npm yt-dlp ffmpeg; do
  command -v "$cmd" >/dev/null 2>&1 || missing+=("$cmd")
done

if (( ${#missing[@]} > 0 )); then
  red "Missing required programs: ${missing[*]}"
  red "Please run setup.command first (double-click it), then try again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  red "Project dependencies are missing."
  red "Please run setup.command first (double-click it), then try again."
  echo
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

bold "Starting karaokey..."
echo "The app will open in your browser in a few seconds."
echo "Leave this window open while you use the app."
echo "When you're done, close this window or press Ctrl+C to stop."
echo

# Open the browser once the dev server is reachable.
(
  for _ in $(seq 1 60); do
    if curl -fs -o /dev/null http://localhost:5173/; then
      open http://localhost:5173/
      exit 0
    fi
    sleep 1
  done
) &

npm run dev
