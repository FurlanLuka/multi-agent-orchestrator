# Projects

Projects are the individual codebases within a workspace. Each project maps to a directory on your filesystem.

---

## Project Settings

| Setting | Description |
|---------|-------------|
| **Path** | Absolute path to the project directory |
| **Dev Server** | Command to start the development server, ready pattern (regex to detect when the server is ready), environment variables, and URL. See [Dev Servers](dev-servers.md). |
| **Build Command** | Command to build the project (e.g., `npm run build`) |
| **Install Command** | Command to install dependencies (e.g., `npm install`) |
| **Setup Command** | One-time setup command run during project initialization |
| **E2E Tests** | Whether the project has end-to-end tests |
| **E2E Instructions** | Custom instructions for E2E test generation (overrides defaults) |
| **Dependencies** | Other projects in the workspace that must complete before this project's E2E tests run |
| **Permissions** | Fine-grained control over what the AI agent can do. See [Permissions](permissions.md). |
| **Attached Design** | A design from your [design library](design-mode.md#design-library) to guide UI implementation |

## Adding Projects

In edit mode, click **Add Project** to add an existing directory as a project. Configure its dev server, build commands, and permissions.

## Feature Badges

Projects display badges indicating their capabilities:

- **Dev** — Dev server configured
- **Build** — Build command configured
- **E2E** — End-to-end tests enabled

---

← [Workspaces](workspaces.md) | [Building Features →](building-features.md)
