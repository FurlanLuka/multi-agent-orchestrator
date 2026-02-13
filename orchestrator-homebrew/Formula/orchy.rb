class Orchy < Formula
  desc "Multi-agent orchestrator for Claude Code"
  homepage "https://github.com/orchyai/homebrew-tap"
  version "1.0.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/orchyai/homebrew-tap/releases/download/v#{version}/orchy-macos-arm64"
      sha256 "PLACEHOLDER_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/orchyai/homebrew-tap/releases/download/v#{version}/orchy-macos-x64"
      sha256 "PLACEHOLDER_SHA256_MACOS_X64"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/orchyai/homebrew-tap/releases/download/v#{version}/orchy-linux-x64"
      sha256 "PLACEHOLDER_SHA256_LINUX_X64"
    end
  end

  def install
    # The downloaded file is the binary itself (not a tarball)
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "orchy-macos-arm64" => "orchy"
      else
        bin.install "orchy-macos-x64" => "orchy"
      end
    elsif OS.linux?
      bin.install "orchy-linux-x64" => "orchy"
    end
  end

  def caveats
    <<~EOS
      To get started, run:
        orchy

      This starts the orchestrator and opens http://localhost:3456 in your browser.

      Options:
        orchy --port 8080     # Use specific port
        orchy --no-browser    # Don't open browser automatically
        orchy --help          # Show all options

      Requirements:
        Claude Code CLI must be installed:
        npm install -g @anthropic-ai/claude-code
    EOS
  end

  test do
    assert_match "version", shell_output("#{bin}/orchy --help")
  end
end
