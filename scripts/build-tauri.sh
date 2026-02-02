#!/usr/bin/env bash
# Build Tauri desktop app
# Assumes CLI binary already exists in dist/

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Orchy Tauri desktop app...${NC}"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Check if CLI binary exists
if [ ! -f "dist/orchy-macos-arm64" ] && [ ! -f "dist/orchy-macos-x64" ]; then
    echo -e "${YELLOW}CLI binary not found. Building CLI first...${NC}"
    ./scripts/build-cli.sh
fi

# Build Tauri app
echo -e "${YELLOW}Building Tauri app...${NC}"
cd orchestrator-tauri
cargo tauri build
cd "$ROOT_DIR"

echo ""
echo -e "${GREEN}Tauri build complete!${NC}"
echo ""
echo "App bundle located at:"
echo "  orchestrator-tauri/target/release/bundle/"
