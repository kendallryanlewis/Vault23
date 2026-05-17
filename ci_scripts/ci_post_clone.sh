#!/bin/sh
set -e

# Install Homebrew (Xcode Cloud macOS images do not include it)
if ! command -v brew &>/dev/null; then
  NONINTERACTIVE=1 /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
fi

# Add Homebrew to PATH for both Apple Silicon and Intel paths
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
echo 'export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"' >> "$HOME/.zprofile"

# Install Node.js LTS
brew install node

# Install Angular app dependencies
cd "$CI_WORKSPACE/closet-web"
npm ci
