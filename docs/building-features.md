# Building Features

This is the core workflow of Orchy. From a workspace, you describe what you want to build and Orchy plans and executes the work across your projects.

---

## Starting a Feature

1. Navigate to your workspace
2. In the **Feature** tab, describe what you want to build in the text editor
3. Select which projects to include (checkboxes on the right)
4. Optionally mark projects as **read-only** (the agent can read but won't modify them — useful for reference projects)
5. Click **Start Planning**

## Branch Check

Before starting, Orchy verifies the [Git state](git-integration.md) of each selected project:

- Are projects on the main branch?
- Are there uncommitted changes?

If issues are found, a modal appears with options:

- **Continue** — Proceed on the current branch
- **Stash & Checkout** — Stash changes and switch to the main branch
- **Cancel** — Go back and resolve manually

## Dev Server Warning

If dev servers are running, Orchy will prompt you to stop them before starting a new session (they'll be managed by the session).

---

Once you click **Start Planning**, you enter the [Planning & Sessions](planning-and-sessions.md) workflow.
