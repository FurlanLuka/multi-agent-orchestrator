# Orchy — User Documentation

> Multi-agent orchestrator for Claude Code. Plan features, execute across multiple projects, design UIs, and deploy — all from one interface.

Orchy lets you describe what you want to build and handles the rest: an AI planning agent refines your feature, explores your codebase, generates a detailed implementation plan, and then coordinates multiple Claude Code agents to execute the work across your projects — all while you stay in control through an interactive web UI.

---

## Quick Start

1. Install Orchy via Homebrew: `brew install orchyai/tap/orchy`
2. Run `orchy` to launch
3. Create a workspace from a template or add existing projects
4. Describe a feature and let the planning agent build it

See [Getting Started](getting-started.md) for the full setup guide, or follow the [Quick Guide](quick-guide.md) for a complete walkthrough from design to implementation.

---

## Table of Contents

### Setup
- [Getting Started](getting-started.md) — Prerequisites, installation, first launch
- [Quick Guide](quick-guide.md) — Design to implementation walkthrough

### Core Concepts
- [Modes](modes.md) — Build, Design, and Deployment modes
- [Workspaces](workspaces.md) — Creating, configuring, managing workspaces
- [Projects](projects.md) — Project settings, dev servers, adding projects

### Building
- [Building Features](building-features.md) — Starting features, branch checks, dev server warnings
- [Planning & Sessions](planning-and-sessions.md) — Planning workflow, plan approval
- [Session Execution](session-execution.md) — Monitoring, agent statuses, verification, notifications

### Design
- [Design Mode](design-mode.md) — Full design workflow, design library, attaching designs

### Deployment
- [Deployment](deployment.md) — Providers, deployment workflow, credentials, existing deployments

### Integrations
- [Git Integration](git-integration.md) — Branch management, pre-session checks
- [GitHub Integration](github-integration.md) — Setup, features, status indicators

### Configuration & Security
- [Permissions](permissions.md) — Permission categories, groups, always-blocked, defaults
- [Project Templates](project-templates.md) — Built-in templates, making your own projects work with Orchy

### Reference
- [Troubleshooting](troubleshooting.md) — Common issues and solutions
