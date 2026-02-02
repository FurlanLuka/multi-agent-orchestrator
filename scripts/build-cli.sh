#!/usr/bin/env bash
# Build CLI binaries for all platforms (without Tauri)
# Creates single-binary packages with embedded web assets

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Building Orchy CLI binaries...${NC}"

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

# Copy web dist into backend for embedding
echo -e "${YELLOW}Embedding web assets into backend...${NC}"
cp -r orchestrator-web/dist orchestrator-backend/web-dist

# Build backend binaries for all platforms
echo -e "${YELLOW}Building CLI binaries for all platforms...${NC}"
npm run build:pkg-all -w orchestrator-backend

# Clean up temporary web-dist copy
rm -rf orchestrator-backend/web-dist

# Copy binaries to Tauri sidecar location with correct names
echo -e "${YELLOW}Copying binaries to Tauri sidecar location...${NC}"
mkdir -p orchestrator-tauri/binaries

# Map pkg names to Tauri target triples
[ -f dist/orchy-macos-arm64 ] && cp dist/orchy-macos-arm64 orchestrator-tauri/binaries/orchy-aarch64-apple-darwin
[ -f dist/orchy-macos-x64 ] && cp dist/orchy-macos-x64 orchestrator-tauri/binaries/orchy-x86_64-apple-darwin
[ -f dist/orchy-linux-x64 ] && cp dist/orchy-linux-x64 orchestrator-tauri/binaries/orchy-x86_64-unknown-linux-gnu
[ -f dist/orchy-windows-x64.exe ] && cp dist/orchy-windows-x64.exe orchestrator-tauri/binaries/orchy-x86_64-pc-windows-msvc.exe

echo ""
echo -e "${GREEN}CLI build complete!${NC}"
echo ""
echo "Release binaries created in dist/:"
ls -la dist/
echo ""
echo "Tauri sidecars updated in orchestrator-tauri/binaries/:"
ls -la orchestrator-tauri/binaries/
echo ""
echo "Each binary is self-contained with embedded web UI and setup files."
