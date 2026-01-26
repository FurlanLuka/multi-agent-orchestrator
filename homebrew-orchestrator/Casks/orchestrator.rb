cask "orchestrator" do
  version "1.0.0"

  # Note: Update sha256 values after building release artifacts
  # Use: shasum -a 256 Orchestrator_*.dmg
  on_arm do
    sha256 "PLACEHOLDER_ARM64_SHA256"
    url "https://github.com/OWNER/orchestrator/releases/download/v#{version}/Orchestrator_#{version}_aarch64.dmg"
  end

  on_intel do
    sha256 "PLACEHOLDER_X64_SHA256"
    url "https://github.com/OWNER/orchestrator/releases/download/v#{version}/Orchestrator_#{version}_x64.dmg"
  end

  name "Orchestrator"
  desc "Multi-agent orchestrator for Claude Code"
  homepage "https://github.com/OWNER/orchestrator"

  livecheck do
    url :url
    strategy :github_latest
  end

  depends_on macos: ">= :catalina"

  app "Orchestrator.app"

  preflight do
    # Check if Claude Code is installed
    unless system("command -v claude > /dev/null 2>&1")
      opoo "Claude Code CLI is required but not installed."
      opoo "Install it with: npm install -g @anthropic-ai/claude-code"
      opoo "Then run: claude auth"
    end
  end

  postflight do
    # Provide helpful message
    ohai "Orchestrator installed successfully!"
    ohai "Make sure Claude Code is installed and authenticated:"
    ohai "  npm install -g @anthropic-ai/claude-code"
    ohai "  claude auth"
  end

  uninstall quit: "com.orchestrator.app"

  zap trash: [
    "~/Library/Application Support/Orchestrator",
    "~/Library/Caches/Orchestrator",
    "~/Library/Logs/Orchestrator",
    "~/Library/Preferences/com.orchestrator.app.plist",
    "~/Library/Saved Application State/com.orchestrator.app.savedState",
    "~/.config/orchestrator",
  ]
end
