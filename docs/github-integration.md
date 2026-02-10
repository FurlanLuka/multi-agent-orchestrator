# GitHub Integration

GitHub integration enables repository management, secret storage, and CI/CD workflows.

---

## Setup

On first launch (or when creating a workspace), Orchy checks for the GitHub CLI (`gh`). If available, it checks your authentication status.

**Authentication**: Orchy uses the GitHub CLI's authentication. Run `gh auth login` if you haven't already. Orchy never stores your GitHub credentials directly — it relies on the `gh` CLI and your system keyring.

## Features

| Feature | Description |
|---------|-------------|
| **Repository creation** | Create new GitHub repos (public or private) for Orchy Managed workspaces |
| **Organization support** | Create repos under your personal account or an organization |
| **Secret management** | Set repository secrets (used for [deployment](deployment.md)) |
| **Auth status** | View your connection status, username, and token scopes |
| **Workflow scope** | Orchy checks if your token has the `workflow` scope (required for creating GitHub Actions workflows) |

## Status Indicators

The workspace screen shows GitHub connection status:

- **Connected** — Authenticated and ready
- **Authentication warning** — Token issues or missing scopes
- **Access issue** — Cannot access the configured repository

See also: [Deployment](deployment.md) for how GitHub integration enables CI/CD.
