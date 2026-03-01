<p align="center">
  <img src="orchy.jpg" alt="Orchy" width="200" />
</p>

<h1 align="center">Orchy</h1>

<p align="center">
  <strong>100% built with <a href="https://docs.anthropic.com/en/docs/claude-code">Claude Code</a> — 0 lines of code were written manually</strong>
</p>

<p align="center">
  Multi-agent orchestrator for Claude Code
</p>

<p align="center">
  <img src="https://raw.githubusercontent.com/orchyai/homebrew-tap/main/images/demo.gif" alt="Orchy demo" width="800" />
</p>

---

Orchy lets you describe what you want to build and handles the rest: an AI planning agent refines your feature, explores your codebase, generates a detailed implementation plan, and then coordinates multiple Claude Code agents to execute the work across your projects — all while you stay in control through an interactive web UI.

## Key Features

- **Build Mode** — Describe a feature in plain English. A planning agent breaks it down into tasks, then multiple Claude Code agents implement it across your projects in parallel.
- **Design Mode** — Create a full design system through an interactive chat: color palettes, typography, component styles, and full-page HTML mockups — before writing any code.
- **Deployment Mode** — Provision cloud infrastructure, set up CI/CD pipelines, and deploy your projects through an AI-guided workflow.
- **Multi-project workspaces** — Manage frontend, backend, and fullstack projects in a single workspace with shared context.
- **Web UI** — Real-time session monitoring, task tracking, plan review and approval, all from your browser.
- **Project templates** — Scaffold new projects from built-in templates (Vite + React, NestJS, fullstack) or bring your own.
- **GitHub integration** — Automatic repository creation, branch management, and deployment workflows.

## Installation (End Users)

Install via Homebrew:

```bash
brew install orchyai/tap/orchy
```

Or download the binary for your platform from the [Releases](https://github.com/orchyai/homebrew-tap/releases) page.

Then just run:

```bash
orchy
```

See the [homebrew-tap repo](https://github.com/orchyai/homebrew-tap) for end-user docs, usage flags, and documentation links.

---

## Development Setup

This is the **monorepo** containing all Orchy source code. If you want to contribute or hack on Orchy itself, read on.

### Prerequisites

| Requirement | Notes |
|---|---|
| **Node.js 18+** | Runtime — includes npm on macOS/Windows. On Linux you may need `sudo apt install npm` separately. |
| **npm** | Comes with Node.js. Used for workspace management and dependency installation. |
| **[Claude Code CLI](https://docs.anthropic.com/en/docs/claude-code)** | The AI agents that do the actual work. Install with `npm install -g @anthropic-ai/claude-code`, then run `claude auth login`. |
| **Git** | Version control and branch management. |
| **[GitHub CLI (`gh`)](https://cli.github.com)** | Optional — for GitHub integration (repo creation, secrets, deployment workflows). Install with `brew install gh`. |

### Project Structure

```
orchestrator/
├── orchestrator-types/     # @orchy/types — shared TypeScript types
├── orchestrator-backend/   # @orchy/backend — Express + Socket.IO server
│   └── src/
│       ├── core/           # Session management, state machine, process manager
│       ├── planning/       # AI planning agent, chat handler, response parser
│       ├── design/         # Design mode — AI-driven mockup generation
│       ├── deployment/     # Deployment providers (Hetzner, etc.)
│       ├── mcp/            # MCP server integration
│       ├── startup/        # Dependency checks, server bootstrap
│       ├── ui/             # WebSocket event handlers
│       └── utils/          # Shared utilities
├── orchestrator-web/       # @orchy/web — Vite + React frontend
│   └── src/
│       ├── components/     # UI components (session, home, settings, etc.)
│       ├── pages/          # Route pages (mode selection, design, library)
│       ├── context/        # React context providers
│       ├── hooks/          # Custom hooks
│       └── theme/          # Mantine theme config
├── orchestrator-tauri/     # Tauri desktop app wrapper (optional)
├── scripts/                # Build & release scripts
├── docs/                   # Documentation
└── package.json            # Root workspace config
```

This is an **npm workspaces** monorepo with three packages:
- `@orchy/types` — shared type definitions, built first
- `@orchy/backend` — Express server with Socket.IO for real-time communication
- `@orchy/web` — Vite + React + Mantine frontend

### Install Dependencies

```bash
npm install
```

This installs dependencies for all workspaces.

### Running Dev Servers

Start both backend and frontend in development mode with a single command:

```bash
npm run dev
```

This runs:
- **Backend** (`orchestrator-backend`) — `ts-node` dev server
- **Frontend** (`orchestrator-web`) — Vite dev server with HMR

Both run concurrently with color-coded output (blue for backend, green for web).

The backend serves on its default port and the Vite dev server proxies to it. Open the URL printed by Vite in your browser.

#### Running individually

```bash
# Types (must be built first if changed)
npm run build:types

# Backend only
npm run dev -w orchestrator-backend

# Frontend only
npm run dev -w orchestrator-web
```

#### Tauri (Desktop App)

```bash
npm run dev:tauri
```

### Building

```bash
# Full production build (types → backend → frontend)
npm run build

# Build types only
npm run build:types

# Clean all build artifacts
npm run clean
```

### Release

```bash
# CLI release (builds platform binaries)
npm run release:cli

# Tauri desktop app release
npm run release:tauri

# Full release
npm run release
```

### Tech Stack

| Layer | Tech |
|---|---|
| **Frontend** | React 19, Vite, Mantine UI, Socket.IO Client, React Router, TipTap, Mermaid |
| **Backend** | Node.js, Express, Socket.IO, Zod, ts-node |
| **Shared Types** | TypeScript strict mode, npm workspaces |
| **Desktop** | Tauri (optional) |
| **AI** | Claude Code CLI (spawned as child processes) |

### Environment & Config

Orchy stores runtime config and logs in `~/.orchy-config/`. Logs are written to `~/.orchy-config/logs/orchestrator.log`.

The port can be set via `ORCHESTRATOR_PORT` env var or `--port` flag (default: 3456).

## Documentation

Full docs are in the [`docs/`](docs/) folder:

- [Getting Started](docs/getting-started.md)
- [Quick Guide](docs/quick-guide.md)
- [Modes](docs/modes.md) — Build, Design, and Deployment
- [Workspaces](docs/workspaces.md)
- [Building Features](docs/building-features.md)
- [Design Mode](docs/design-mode.md)
- [Deployment](docs/deployment.md)
- [Project Templates](docs/project-templates.md)
- [GitHub Integration](docs/github-integration.md)
- [Troubleshooting](docs/troubleshooting.md)

## Design Showcase

Examples of designs generated with Orchy's Design Mode:

- [Creative Experiment](https://orchyai.github.io/homebrew-tap/designs/creative-experiment/)
- [Prism Art Direction](https://orchyai.github.io/homebrew-tap/designs/prism/)

## Disclaimer

Orchy is in early development and has only been tested on a limited number of machines. It is not guaranteed to work in every environment or without bugs. If you encounter issues, please open an issue on the [homebrew-tap repo](https://github.com/orchyai/homebrew-tap/issues).

## License

Proprietary. All rights reserved.
