class Aio < Formula
  desc "Multi-agent orchestrator for Claude Code"
  homepage "https://github.com/FurlanLuka/multi-agent-orchestrator"
  version "1.0.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/FurlanLuka/multi-agent-orchestrator/releases/download/v#{version}/aio-macos-arm64"
      sha256 "PLACEHOLDER_SHA256_MACOS_ARM64"
    end
    on_intel do
      url "https://github.com/FurlanLuka/multi-agent-orchestrator/releases/download/v#{version}/aio-macos-x64"
      sha256 "PLACEHOLDER_SHA256_MACOS_X64"
    end
  end

  on_linux do
    on_intel do
      url "https://github.com/FurlanLuka/multi-agent-orchestrator/releases/download/v#{version}/aio-linux-x64"
      sha256 "PLACEHOLDER_SHA256_LINUX_X64"
    end
  end

  def install
    # The downloaded file is the binary itself (not a tarball)
    if OS.mac?
      if Hardware::CPU.arm?
        bin.install "aio-macos-arm64" => "aio"
      else
        bin.install "aio-macos-x64" => "aio"
      end
    elsif OS.linux?
      bin.install "aio-linux-x64" => "aio"
    end
  end

  def caveats
    <<~EOS
      To get started, run:
        aio

      This starts the orchestrator and opens http://localhost:3456 in your browser.

      Options:
        aio --port 8080     # Use specific port
        aio --no-browser    # Don't open browser automatically
        aio --help          # Show all options

      Requirements:
        Claude Code CLI must be installed:
        npm install -g @anthropic-ai/claude-code
    EOS
  end

  test do
    assert_match "AIO Orchestrator", shell_output("#{bin}/aio --help")
  end
end
