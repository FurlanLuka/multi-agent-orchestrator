# Homebrew Tap for Orchestrator

This is the official Homebrew tap for [Orchestrator](https://github.com/OWNER/orchestrator), a multi-agent orchestrator for Claude Code.

## Installation

```bash
# Add this tap
brew tap OWNER/orchestrator

# Install Orchestrator
brew install --cask orchestrator
```

## Requirements

Before using Orchestrator, you need Claude Code CLI installed:

```bash
# Install Claude Code
npm install -g @anthropic-ai/claude-code

# Authenticate
claude auth
```

## Updating

```bash
brew upgrade --cask orchestrator
```

## Uninstalling

```bash
brew uninstall --cask orchestrator

# To also remove all data:
brew uninstall --cask --zap orchestrator
```

## Troubleshooting

### "App is damaged and can't be opened"

If you see this error, it's because the app isn't signed. Remove the quarantine attribute:

```bash
xattr -cr /Applications/Orchestrator.app
```

### Claude Code not found

Ensure Claude Code is in your PATH. If you installed Node.js via nvm:

```bash
# Add to ~/.zshrc or ~/.bashrc
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
```

Then restart Orchestrator.

## Data Locations

| Data | Path |
|------|------|
| Sessions | `~/Library/Application Support/Orchestrator/sessions/` |
| Logs | `~/Library/Logs/Orchestrator/` |
| Config | `~/.config/orchestrator/` |
| Cache | `~/Library/Caches/Orchestrator/` |

## Publishing Updates

When releasing a new version:

1. Build and publish the release on GitHub
2. Get the SHA256 of the DMG files:
   ```bash
   shasum -a 256 Orchestrator_*_aarch64.dmg
   shasum -a 256 Orchestrator_*_x64.dmg
   ```
3. Update `Casks/orchestrator.rb` with new version and SHA256 values
4. Commit and push to this tap repository
