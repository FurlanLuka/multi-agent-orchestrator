# Project Templates

Orchy includes built-in templates for rapid project scaffolding. You can also set up any existing project to work well with Orchy by adding a few files and configuring it through the UI.

---

## Built-in Templates

### vite-frontend

A React frontend project with:

- React 19 + TypeScript
- Vite bundler
- Mantine 8 UI component library
- TanStack React Query for data fetching
- React Router 7 for navigation
- Axios for HTTP requests
- Prettier for formatting
- Pre-configured dev server on port 5173
- Playwright MCP for E2E testing

### nestjs-backend

A NestJS backend project with:

- NestJS 11 + TypeScript
- Prisma 7 ORM with SQLite (via better-sqlite3 adapter)
- Input validation (class-validator + class-transformer)
- Pre-configured dev server on port 3000 (watch mode)
- Database migration and seeding commands
- curl-based E2E testing

## What Templates Set Up

When you create a [workspace](workspaces.md) from a template:

1. Project directories are created with all template files
2. Dependencies are installed (`npm install`)
3. Setup commands run (e.g., adding Playwright MCP server)
4. Dev server, build, and install commands are configured
5. [Permissions](permissions.md) are set to sensible defaults
6. E2E testing is configured
7. For fullstack templates, project dependencies are set (frontend E2E waits for backend)

---

## Making Your Own Projects Work with Orchy

You don't need a template to use Orchy. Any existing project can work well — create an [empty workspace](workspaces.md#empty-workspace), add your project directories, and configure them through the UI. To get the best results from the AI agents, add a few files to your project.

### CLAUDE.md

Add a `CLAUDE.md` file to your project root. This is the most important file for code quality — it tells the AI agent how to work with your project.

Include:

- **Tech stack** — frameworks, libraries, versions
- **Project structure** — directory layout with descriptions
- **Conventions** — naming, file organization, patterns to follow
- **Guidelines** — do's and don'ts for the codebase

Be specific and opinionated — the more guidance you provide, the more consistent the agent's output will be.

**Example:**

```markdown
# My Project

React frontend with TypeScript and Tailwind CSS.

## Tech Stack
- React 18 + Vite
- TypeScript
- Tailwind CSS
- Zustand for state management

## Project Structure
src/
├── pages/           # Route-level components
├── components/      # Shared UI components
├── hooks/           # Custom React hooks
├── stores/          # Zustand stores
├── api/             # API client and hooks
└── utils/           # Pure utility functions

## Guidelines
1. Components go in features/ unless shared across 3+ features
2. Use Zustand for global state, React Query for server state
3. All API calls go through api/ hooks
4. No CSS files — use Tailwind utility classes

## Never Do
- Use useState for data that comes from the API
- Create components longer than 250 lines
- Import from deep internal paths
```

### Skills (`.claude/skills/`)

Skills are markdown files that teach the AI agent specialized workflows. Add them in a `.claude/skills/` directory at your project root.

Each skill has a YAML frontmatter header:

```markdown
---
name: skill-name
description: When to use this skill. Be specific so the agent knows when to invoke it.
---

# Skill Title

Step-by-step instructions with code examples...
```

**Recommended skills:**

| Skill | Purpose |
|-------|---------|
| Feature creation | How to add a new feature/module (directory structure, naming, wiring) |
| E2E testing | How to run E2E tests (required if E2E is enabled in project settings) |
| Domain-specific | ORM patterns, state management, API conventions, etc. |

### E2E Testing Skill

If you enable E2E testing for your project (in the project settings), include an `e2e-testing.md` skill that tells the agent how to verify functionality.

Orchy supports two E2E approaches:

**Frontend (Playwright MCP):** The agent uses Playwright MCP tools to navigate, click, type, and verify the UI. No test scripts are written — the agent drives the browser interactively.

**Backend (curl):** The agent uses curl commands to test API endpoints directly. No test framework needed.

Both approaches must use **test status markers** so Orchy can track results in real time:

```
[TEST_STATUS] {"scenario": "scenario name", "status": "running"}
[TEST_STATUS] {"scenario": "scenario name", "status": "passed"}
[TEST_STATUS] {"scenario": "scenario name", "status": "failed", "error": "what went wrong"}
```

And produce a **final report** as JSON:

```json
{
  "allPassed": true,
  "failures": [],
  "overallAnalysis": "Summary of results"
}
```

See the built-in template skills for complete examples of both approaches.

### Project Settings in the UI

After adding your project to a workspace, configure it through the UI in **Edit** mode:

| Setting | How to Configure |
|---------|-----------------|
| **Dev Server** | Enter the command, ready pattern (regex to detect server startup), environment variables, and URL |
| **Build Command** | The command Orchy runs to verify code after each task (e.g., `npm run build`) |
| **Install Command** | Command to install dependencies (e.g., `npm install`) |
| **E2E Tests** | Toggle on if your project has E2E tests (make sure you have an `e2e-testing.md` skill) |
| **E2E Instructions** | Optional custom instructions that override the default E2E behavior |
| **Dependencies** | Other projects in the workspace that must complete before this project's E2E tests run |
| **Permissions** | Fine-grained control over what the agent can do — see [Permissions](permissions.md) |
| **Attached Design** | Optionally attach a design from your [design library](design-mode.md#design-library) |

### Tips for Best Results

- **Keep CLAUDE.md under control** — focus on rules and structure, not exhaustive documentation. The agent can read your code.
- **Skills with code examples** — show the exact patterns you want the agent to follow. A concrete example is worth more than a paragraph of description.
- **Enable build verification** — set a build command so Orchy can catch errors after each task and auto-fix them.
- **Set permissions thoughtfully** — enable what the agent needs, but keep destructive operations locked down. See [Permissions](permissions.md).
