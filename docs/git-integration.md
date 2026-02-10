# Git Integration

Orchy integrates with Git to manage branches and track changes during sessions.

---

## How It Works

- **Branch creation**: When a session starts, Orchy creates a feature branch from your main branch for each included project
- **Branch naming**: Branches are automatically named based on the feature description
- **Pre-session checks**: Orchy verifies branch status and uncommitted changes before starting
- **Orchy Managed workspaces**: Git is fully managed — repository initialization, `.gitignore` configuration, and branch management are automatic

## Branch Check Before Sessions

Before starting a session, Orchy checks each project:

- Is it on the main branch?
- Are there staged, unstaged, or untracked changes?

Options when issues are found:

| Option | What happens |
|--------|-------------|
| **Continue** | Work on the current branch as-is |
| **Stash & Checkout** | Stash all changes, switch to main, create a new feature branch |
| **Cancel** | Return to the workspace screen |

See also: [Building Features](building-features.md#branch-check) for how this fits into the feature workflow.
