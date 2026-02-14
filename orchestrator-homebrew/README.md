# Orchy

> Multi-agent orchestrator for Claude Code

Orchy lets you describe what you want to build and handles the rest: an AI planning agent refines your feature, explores your codebase, generates a detailed implementation plan, and then coordinates multiple Claude Code agents to execute the work across your projects — all while you stay in control through an interactive web UI.

---

## Key Features

- **Build Mode** — Describe a feature in plain English. A planning agent breaks it down into tasks, then multiple Claude Code agents implement it across your projects in parallel.
- **Design Mode** — Create a full design system through an interactive chat: color palettes, typography, component styles, and full-page HTML mockups — before writing any code.
- **Deployment Mode** — Provision cloud infrastructure, set up CI/CD pipelines, and deploy your projects through an AI-guided workflow.
- **Multi-project workspaces** — Manage frontend, backend, and fullstack projects in a single workspace with shared context.
- **Web UI** — Real-time session monitoring, task tracking, plan review and approval, all from your browser.
- **Project templates** — Scaffold new projects from built-in templates (Vite + React, NestJS, fullstack) or bring your own.
- **GitHub integration** — Automatic repository creation, branch management, and deployment workflows.

## Prerequisites

**Required:**
- **[Node.js 18+](https://nodejs.org)** — Runtime (includes npm on macOS/Windows; on Linux you may need `sudo apt install npm` separately)
- **npm** — Package manager for project setup and installing Claude Code
- **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** — AI agents. Install with `npm install -g @anthropic-ai/claude-code`, then run `claude auth login`
- **Git** — Version control and branch management

**Optional:**
- **[GitHub CLI (`gh`)](https://cli.github.com)** — For GitHub integration (repo creation, secrets, deployment workflows). Install with `brew install gh`

## Installation

Install via Homebrew:

    brew install orchyai/tap/orchy

Or download the binary for your platform from the Releases page.

## Usage

    orchy

Orchy starts a local server (default port: 3456) and opens the web UI in your browser.

| Flag              | Description                        |
|-------------------|------------------------------------|
| --port <number>   | Use a specific port                |
| --no-browser      | Start without opening the browser  |
| --help            | Show help                          |

You can also set the port via the ORCHESTRATOR_PORT environment variable.

## Documentation

Full documentation is available in the docs/ folder:

- Getting Started — Prerequisites, installation, first launch
- Quick Guide — Design to implementation walkthrough
- Modes — Build, Design, and Deployment modes
- Workspaces — Creating and managing workspaces
- Building Features — Starting features and planning
- Design Mode — Full design workflow
- Deployment — Providers, deployment workflow, credentials
- Troubleshooting — Common issues and solutions

See the full table of contents for all topics.

## Disclaimer

Orchy is in early development and has only been tested on a limited number of machines. It is not guaranteed to work in every environment or without bugs. If you encounter issues, please open an issue on this repository.

## License

Proprietary. All rights reserved.
