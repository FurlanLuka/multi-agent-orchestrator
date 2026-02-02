#!/usr/bin/env bash
# Build full release artifacts for Orchy
# Creates CLI binaries for all platforms + Tauri desktop app

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Orchy full release...${NC}"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Build CLI binaries
echo -e "${YELLOW}Step 1: Building CLI binaries...${NC}"
./scripts/build-cli.sh

# Build Tauri app
echo -e "${YELLOW}Step 2: Building Tauri desktop app...${NC}"
./scripts/build-tauri.sh

echo ""
echo -e "${GREEN}Full release build complete!${NC}"
echo ""
echo "To test CLI binary locally:"
echo "  ./dist/orchy-macos-arm64"
echo ""
echo "Tauri app bundle located at:"
echo "  orchestrator-tauri/target/release/bundle/"
echo ""
echo "Each CLI binary is self-contained with embedded web UI and setup files."
echo "The Tauri app wraps the backend as a sidecar with native desktop window."
