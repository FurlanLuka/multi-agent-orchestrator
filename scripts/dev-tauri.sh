#!/usr/bin/env bash
# Build dev binary for current platform (no obfuscation) and run Tauri dev
# Much faster than full release build

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Orchy for Tauri dev...${NC}"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Detect current platform
ARCH=$(uname -m)
OS=$(uname -s)

if [ "$OS" = "Darwin" ]; then
    if [ "$ARCH" = "arm64" ]; then
        PKG_TARGET="node18-macos-arm64"
        TAURI_TARGET="aarch64-apple-darwin"
    else
        PKG_TARGET="node18-macos-x64"
        TAURI_TARGET="x86_64-apple-darwin"
    fi
elif [ "$OS" = "Linux" ]; then
    PKG_TARGET="node18-linux-x64"
    TAURI_TARGET="x86_64-unknown-linux-gnu"
else
    echo "Unsupported platform: $OS $ARCH"
    exit 1
fi

echo -e "${YELLOW}Detected platform: $OS $ARCH -> $PKG_TARGET${NC}"

# Clean previous backend build
rm -rf orchestrator-backend/dist/
rm -rf orchestrator-backend/web-dist/

# Build TypeScript (no obfuscation for dev)
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build

# Copy web dist into backend for embedding
echo -e "${YELLOW}Embedding web assets into backend...${NC}"
cp -r orchestrator-web/dist orchestrator-backend/web-dist

# Build binary for current platform only
echo -e "${YELLOW}Building dev binary for $PKG_TARGET...${NC}"
mkdir -p dist/
cd orchestrator-backend
npx pkg . --targets "$PKG_TARGET" --output "../dist/orchy-dev"
cd "$ROOT_DIR"

# Clean up temporary web-dist copy
rm -rf orchestrator-backend/web-dist

# Copy to Tauri binaries with correct name
echo -e "${YELLOW}Copying to Tauri sidecar location...${NC}"
mkdir -p orchestrator-tauri/binaries
cp dist/orchy-dev "orchestrator-tauri/binaries/orchy-$TAURI_TARGET"

echo ""
echo -e "${GREEN}Dev binary ready! Starting Tauri dev...${NC}"
echo ""

# Run Tauri dev
cd orchestrator-tauri
cargo tauri dev
