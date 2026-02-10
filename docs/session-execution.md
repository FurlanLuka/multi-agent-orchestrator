# Session Execution

After approving a plan, Orchy begins executing tasks across your projects using Claude Code agents.

---

## Session View Layout

The session view has two panels:

### Left Panel — Planning Chat

- Ongoing conversation with the Planning Agent
- The agent reports progress, asks questions if needed, and coordinates execution
- You can send messages at any time to guide the process

### Right Panel — Status & Outputs

The right panel shows:

#### Feature Card
- Feature description and start time
- Collapsible sections for the plan overview and architecture diagram

#### Tasks & Tests
- Tabbed by project
- Task list with real-time status updates
- Test scenarios with pass/fail indicators

#### Project Tracking
- Tabbed by project, showing:
  - **Status badge** — Current state of the agent
  - **Progress bar** — Visual progress indicator (animated when working)
  - **Status message** — What the agent is currently doing
  - **Log tabs** — Switch between Agent Output and Dev Server logs
  - **Terminal viewer** — Real-time log output in a terminal-style display

## Agent Status States

| Status | Meaning |
|--------|---------|
| **Pending** | Task queued, not yet started |
| **Working** | Agent is actively implementing |
| **Debugging** | Agent is fixing an issue |
| **Fatal Debugging** | Critical error being addressed |
| **E2E Testing** | Running end-to-end tests |
| **E2E Fixing** | Fixing failed E2E tests |
| **Ready** | Task completed successfully |
| **Complete** | All work done |
| **Blocked** | Waiting for a dependency |
| **Failed** | Task could not be completed |

## Verification & Fix Cycles

After each task, Orchy automatically verifies the work:

1. Installs dependencies (if configured)
2. Runs the build command
3. Restarts the dev server
4. Checks for errors

If verification fails, the Planning Agent analyzes the error and sends a fix prompt to the agent. This can repeat up to 3 times before escalating.

## Interactive Actions During Execution

- **Retry** — Retry a failed project with an optional hint message
- **Skip E2E** — Skip end-to-end tests for a project
- **Stop Session** — Stop the entire session (confirmation required)

## Permission Prompts

During execution, agents may request [permission](permissions.md) for certain operations. A full-screen overlay appears asking you to approve or deny the action.

## User Input Requests

The agent may request information from you during execution:

- **Text input** — Free-form text field
- **Confirmation** — Yes/no decision
- **CLI verification** — Verify a command-line tool is installed
- **GitHub secret** — Provide a secret value for CI/CD

## Notifications

Click the **notification bell** icon in the session header to enable:

- **Desktop notifications** — Browser push notifications for status changes
- **Audio notifications** — Sound alerts for important events

Useful when Orchy is running in the background — you'll be alerted when the agent needs input or tasks complete.

## Session Completion

When all tasks complete, a summary panel appears showing what was accomplished. You can start a new session or navigate back to the workspace.

## Session History

Previous sessions are listed on the workspace screen. You can:

- **Resume** an interrupted session
- **View** a completed session's history (read-only replay of the session timeline)
