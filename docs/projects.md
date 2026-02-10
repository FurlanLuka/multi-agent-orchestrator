# Projects

Projects are the individual codebases within a workspace. Each project maps to a directory on your filesystem.

---

## Project Settings

| Setting | Description |
|---------|-------------|
| **Path** | Absolute path to the project directory |
| **Dev Server** | Command, ready pattern, environment variables, and URL (see below) |
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

## Dev Server Configuration

Each project can have a development server that Orchy manages during sessions.

| Field | Description |
|-------|-------------|
| **Command** | The shell command to start the server (e.g., `npm run dev`) |
| **Ready Pattern** | A regex pattern to detect when the server is ready (matched against stdout, e.g., `Local:.*http`) |
| **Environment Variables** | Key-value pairs passed to the server process |
| **URL** | The server's URL (e.g., `http://localhost:5173`) |

### During Sessions

- Dev servers start automatically when execution begins
- Logs are streamed in real-time to the session view (under the **Dev Server** log tab)
- Servers restart automatically after tasks complete (to pick up code changes)
- Port conflicts are detected and resolved with a prompt

### Outside Sessions

- **Run Dev Servers** button on the workspace screen lets you start servers manually
- A **floating dev server panel** provides quick access to server status and logs
