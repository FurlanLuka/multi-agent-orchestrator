# Workspaces

A **workspace** is a container that groups related projects together. All orchestration happens within the context of a workspace.

---

## Creating a Workspace

From the home screen, click **Add New Workspace**. You have two options:

### From Template

- Enter a workspace name (project names are generated automatically)
- Choose an app type: **Frontend**, **Backend**, or **Fullstack** (creates both)
- Optionally attach a saved design system from your [design library](design-mode.md#design-library)
- Optionally enable [GitHub integration](github-integration.md) (creates a repository)

Template workspaces are **Orchy Managed** — Orchy handles the Git repository structure, branches, and project scaffolding for you. See [Project Templates](project-templates.md) for what's included.

### Empty Workspace

- Enter a workspace name
- Add existing projects by selecting their directories from your filesystem

Empty workspaces let you bring your own projects with their own Git repositories.

## Workspace Settings

Each workspace has:

| Setting | Description |
|---------|-------------|
| **Name** | Display name for the workspace |
| **Context** | Markdown-formatted rules and guidelines for the planning agent. Use this to document architectural decisions, coding standards, API conventions, or anything the AI should know when planning features. |
| **Projects** | The list of [projects](projects.md) in this workspace |
| **GitHub** | [GitHub integration](github-integration.md) settings (repo, visibility, owner) |
| **Deployment** | [Deployment](deployment.md) infrastructure state (once provisioned) |
| **Main Branch** | The primary Git branch (default: `main`) |

## Managing Workspaces

- **Edit**: Click on a workspace card, then use the **Edit** button to modify projects, context, and settings
- **Delete**: Click the delete button on a workspace card (confirmation required)
