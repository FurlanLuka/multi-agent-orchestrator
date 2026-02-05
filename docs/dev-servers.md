# Dev Servers

Orchy manages development servers for your projects during sessions.

---

## Configuration

Each [project](projects.md) can have a dev server configured with:

- **Command** — The shell command to start the server (e.g., `npm run dev`)
- **Ready Pattern** — A regex pattern to detect when the server is ready (matched against stdout, e.g., `Local:.*http`)
- **Environment Variables** — Key-value pairs passed to the server process
- **URL** — The server's URL for health checks

## During Sessions

- Dev servers are started automatically when [execution](session-execution.md) begins
- Logs are streamed in real-time to the session view (under the **Dev Server** log tab)
- Servers are restarted automatically after tasks complete (to pick up code changes)
- Port conflicts are detected and resolved with a prompt

## Manual Control

- **Run Dev Servers** button on the workspace screen lets you start servers outside of a session
- **Floating Dev Server Panel** provides quick access to server status and logs
- **Log Viewer Modal** shows full dev server output with auto-scroll

---

← [Credentials](credentials.md) | [Project Templates →](project-templates.md)
