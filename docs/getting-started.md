# Getting Started

Get Orchy up and running on your machine.

---

## Prerequisites

- **Claude CLI** — Orchy uses the Claude Code CLI to run AI agents. You must have the `claude` CLI installed and authenticated before using Orchy.
- **Git** — Required for version control features. Orchy manages branches, commits, and repository operations through Git.
- **GitHub CLI (`gh`)** — Optional but recommended. Required for GitHub integration features (repository creation, secret management, deployment workflows).
- **Node.js 18+** — Required runtime.

## Installation

Orchy is distributed as a standalone binary. Install via Homebrew:

```bash
brew install orchyai/tap/orchy
```

Or download the binary for your platform from the GitHub Releases page.

## Launching

```bash
orchy
```

Orchy starts a local server (default port: 3456) and automatically opens the web UI in your browser. If port 3456 is in use, Orchy will automatically find the next available port.

**CLI Options:**

| Flag | Description |
|------|-------------|
| `--port <number>` | Use a specific port |
| `--no-browser` | Start without opening the browser |
| `--help` | Show help |

You can also set the port via the `ORCHESTRATOR_PORT` environment variable.

Orchy also ships as a **desktop application** (via Tauri) that wraps the same functionality in a native window.

## First Launch

On first launch, Orchy checks that the Claude CLI is installed and available. If it's not found, you'll see installation instructions. Once dependencies are verified, you'll land on the **Mode Selection** screen.

From here you can choose between [Build Mode, Design Mode, and Deployment Mode](modes.md), or create your first [workspace](workspaces.md).
