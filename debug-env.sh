#!/bin/bash
# Debug script to compare shell environment
# Run this in the project directory: bash /path/to/debug-env.sh

echo "=== Shell Environment Debug ==="
echo ""
echo "Shell: $SHELL"
echo "Current shell: $0"
echo "CWD: $(pwd)"
echo ""
echo "PATH (first 200 chars): ${PATH:0:200}..."
echo ""
echo "Node/npm paths in PATH:"
echo "$PATH" | tr ':' '\n' | grep -E "(nvm|npm|node|homebrew)" | head -5
echo ""
echo "Which npm: $(which npm)"
echo "Which node: $(which node)"
echo "npm version: $(npm --version 2>/dev/null || echo 'not found')"
echo "node version: $(node --version 2>/dev/null || echo 'not found')"
echo ""
echo "=== Running npm install ==="
npm install
echo ""
echo "=== node_modules/.bin contents ==="
ls -la node_modules/.bin/ 2>/dev/null | head -20 || echo "node_modules/.bin does not exist"
echo ""
echo "=== Checking for vite ==="
ls -la node_modules/.bin/vite 2>/dev/null || echo "vite not found in node_modules/.bin"
