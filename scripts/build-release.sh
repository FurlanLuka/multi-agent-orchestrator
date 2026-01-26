#!/usr/bin/env bash
# Build release artifacts for AIO Orchestrator
# Creates single-binary packages for all platforms with embedded assets

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building AIO Orchestrator release...${NC}"

# Get script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# Clean previous builds
echo -e "${YELLOW}Cleaning previous builds...${NC}"
rm -rf dist/
rm -rf orchestrator-backend/web-dist/

# Create dist directory
mkdir -p dist/

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
npm run build

# Obfuscate backend code
echo -e "${YELLOW}Obfuscating backend code...${NC}"
npm run obfuscate -w orchestrator-backend

# Build web frontend
echo -e "${YELLOW}Building web frontend...${NC}"
npm run build:web

# Copy web dist into backend for embedding
echo -e "${YELLOW}Embedding web assets into backend...${NC}"
cp -r orchestrator-web/dist orchestrator-backend/web-dist

# Check if pkg is installed
if ! command -v pkg &> /dev/null; then
  echo -e "${YELLOW}Installing pkg...${NC}"
  npm install -g pkg
fi

# Build backend binaries for all platforms (assets embedded via pkg config)
echo -e "${YELLOW}Building backend binaries with embedded assets...${NC}"

echo "  Building macOS ARM64..."
npm run build:pkg-macos-arm64 -w orchestrator-backend

echo "  Building macOS x64..."
npm run build:pkg-macos-x64 -w orchestrator-backend

echo "  Building Linux x64..."
npm run build:pkg-linux-x64 -w orchestrator-backend

echo "  Building Windows x64..."
npm run build:pkg-windows-x64 -w orchestrator-backend

# Clean up temporary web-dist copy
rm -rf orchestrator-backend/web-dist

echo ""
echo -e "${GREEN}Build complete!${NC}"
echo ""
echo "Release binaries created in dist/:"
ls -la dist/

echo ""
echo "To test locally:"
echo "  ./dist/aio-macos-arm64"
echo ""
echo "Each binary is self-contained with embedded web UI and setup files."
