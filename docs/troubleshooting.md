# Troubleshooting

Common issues and how to resolve them.

---

## Orchy won't start

- **Port in use**: Orchy automatically finds an available port. If you need a specific port, use `orchy --port <number>`.
- **Claude CLI not found**: Install the Claude Code CLI and ensure it's in your PATH. See [Getting Started](getting-started.md#prerequisites).
- **Backend connection error**: Check the application log at `~/.orchy-config/logs/orchestrator.log`.

## Agent isn't doing anything

- Check the **Agent Output** log tab in the [session view](session-execution.md#session-view-layout) for errors.
- The agent may be waiting for a **permission prompt** — check for overlays. See [Permissions](permissions.md).
- The agent may need **user input** — look for input request overlays. See [Session Execution](session-execution.md#user-input-requests).

## GitHub integration not working

- Run `gh auth status` to verify your GitHub CLI authentication.
- Ensure your token has the required scopes (especially `workflow` for deployment).
- Check the GitHub status badges on the workspace screen for specific error messages.
- See [GitHub Integration](github-integration.md) for setup details.

## Dev server won't start

- Verify the command works when run manually in the project directory.
- Check that the **ready pattern** regex matches your server's startup output.
- Look at the Dev Server log tab for error output.
- Check for **port conflicts** — another process may be using the same port.
- See [Projects](projects.md#dev-server-configuration) for configuration details.

## Session stuck or unresponsive

- Use the **Stop Session** button in the header to end the session.
- Check `~/.orchy-config/logs/orchestrator.log` for errors.
- Restart Orchy and resume the session from the workspace screen.
- See [Session Execution](session-execution.md#session-history) for resuming sessions.

## Permission denied errors

- Review the project's [permission settings](permissions.md) in edit mode.
- Some operations are [always blocked](permissions.md#always-blocked-operations) for safety.
- When prompted, approve the specific operation the agent needs.
