#!/usr/bin/env bash
# karaokey — one-time setup for macOS (Intel + Apple Silicon)
# Safe to re-run.

set -euo pipefail

cd "$(dirname "$0")"

bold()  { printf "\033[1m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
step()  { printf "\n\033[1;34m==> %s\033[0m\n" "$*"; }

if [[ "$(uname -s)" != "Darwin" ]]; then
  red "This setup script is for macOS only."
  red "If you're on Linux or Windows, please see the README for manual steps."
  exit 1
fi

bold "karaokey setup"
echo "This will install everything needed to run karaokey on this Mac."
echo "It is safe to run multiple times. You may be asked for your password."
echo

# 1. Xcode Command Line Tools (needed for git, compilers, Homebrew)
step "Checking Xcode Command Line Tools"
if xcode-select -p >/dev/null 2>&1; then
  green "Already installed."
else
  echo "Installing Xcode Command Line Tools. A dialog will pop up — click 'Install' and wait for it to finish."
  xcode-select --install || true
  echo
  echo "Waiting for Command Line Tools install to complete..."
  until xcode-select -p >/dev/null 2>&1; do
    sleep 5
  done
  green "Command Line Tools installed."
fi

# 2. Homebrew
step "Checking Homebrew"
if ! command -v brew >/dev/null 2>&1; then
  echo "Installing Homebrew (the standard macOS package manager)."
  echo
  bold "macOS needs your permission to do this."
  echo "It will ask for your Mac login password — the same one you use to log in."
  echo "Type it and press Enter. The password stays hidden as you type; that is normal."
  echo

  # The Homebrew installer runs non-interactively (so it doesn't stall waiting
  # for a keypress), which means it cannot prompt for a password itself.
  # Authorize administrator access up front instead.
  if ! sudo -v; then
    red "Could not get administrator access."
    red "Your macOS account must be an Administrator to install Homebrew."
    exit 1
  fi

  # Keep that authorization alive for the rest of this script — the install
  # can take several minutes and macOS otherwise times the password out.
  ( while true; do sudo -n true; sleep 50; kill -0 "$$" 2>/dev/null || exit; done ) &
  SUDO_KEEPALIVE_PID=$!
  trap '[[ -n "${SUDO_KEEPALIVE_PID:-}" ]] && kill "$SUDO_KEEPALIVE_PID" 2>/dev/null || true' EXIT

  NONINTERACTIVE=1 /bin/bash -c \
    "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Make `brew` available in this shell session regardless of arch.
if [[ -x /opt/homebrew/bin/brew ]]; then
  eval "$(/opt/homebrew/bin/brew shellenv)"
elif [[ -x /usr/local/bin/brew ]]; then
  eval "$(/usr/local/bin/brew shellenv)"
fi

if ! command -v brew >/dev/null 2>&1; then
  red "Homebrew install failed. Please install manually from https://brew.sh and re-run this script."
  exit 1
fi

# Persist brew on PATH for future terminal sessions.
BREW_SHELLENV_LINE='eval "$('"$(command -v brew)"' shellenv)"'
for rc in "$HOME/.zprofile" "$HOME/.bash_profile"; do
  if [[ -f "$rc" ]] && ! grep -Fq "$BREW_SHELLENV_LINE" "$rc"; then
    echo "$BREW_SHELLENV_LINE" >> "$rc"
  elif [[ ! -f "$rc" ]]; then
    echo "$BREW_SHELLENV_LINE" >> "$rc"
  fi
done
green "Homebrew ready."

# 3. System packages: node, yt-dlp, ffmpeg
step "Installing system packages (node, yt-dlp, ffmpeg)"
brew update >/dev/null
for pkg in node yt-dlp ffmpeg; do
  if brew list --formula "$pkg" >/dev/null 2>&1; then
    echo "  - $pkg: already installed (upgrading if outdated)"
    brew upgrade "$pkg" >/dev/null 2>&1 || true
  else
    echo "  - $pkg: installing..."
    brew install "$pkg"
  fi
done
green "System packages ready."

# 4. npm dependencies
step "Installing project dependencies (this may take a minute)"
npm install
green "Project dependencies ready."

# 5. Remove the macOS "downloaded from the internet" quarantine flag from the
# helper scripts so start.command can be opened with a normal double-click.
step "Unlocking start.command for double-click use"
xattr -d com.apple.quarantine setup.command start.command 2>/dev/null || true
green "Done."

step "All set!"
echo
bold "To start karaokey, double-click 'start.command' in this folder."
echo
