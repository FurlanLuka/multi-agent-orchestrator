# Permissions

Orchy uses a fine-grained permission system to control what AI agents can do in your projects. This keeps you in control and prevents unintended actions.

---

## How Permissions Work

Each [project](projects.md) has its own permission configuration. When an agent needs to perform an action that isn't pre-approved, a **permission prompt** appears on screen asking you to approve or deny it.

## Permission Categories

### File Operations

| Permission | Description |
|------------|-------------|
| **Read** | Read file contents |
| **Write** | Create new files |
| **Edit** | Modify existing files |
| **Glob** | Search files by name pattern |
| **Grep** | Search file contents |

### Shell Commands

| Permission | Description |
|------------|-------------|
| **npm run** | Run npm scripts |
| **npm install** | Install packages |
| **npm ci** | Clean install |
| **npx** | Run npm package binaries |
| **node** | Run Node.js |
| **curl** | Make HTTP requests (for API testing) |
| **ls, cat, find, wc** | Read-only filesystem commands |
| **mkdir, cp, mv, echo** | File management commands |
| **git status, diff, log** | Read-only Git operations |
| **git add, commit** | Git staging and committing |

### Browser Automation (Playwright)

| Permission | Description |
|------------|-------------|
| **Navigate** | Open URLs in browser |
| **Snapshot** | Capture page accessibility tree |
| **Click** | Click elements |
| **Type** | Type text into fields |
| **Fill Form** | Fill multiple form fields |
| **Screenshot** | Take page screenshots |
| **Wait For** | Wait for elements/text |
| **Select Option** | Select dropdown options |
| **Hover** | Hover over elements |
| **Press Key** | Simulate keyboard input |
| **Console Messages** | Read browser console |
| **Network Requests** | Monitor network traffic |

## Permission Groups

For convenience, permissions can be enabled in groups:

| Group | Includes |
|-------|----------|
| **All File Operations** | Read, Write, Edit, Glob, Grep |
| **All NPM Commands** | npm run, install, ci, npx |
| **Read-Only Bash** | ls, cat, find, wc |
| **File Management Bash** | mkdir, cp, mv, echo |
| **Read-Only Git** | git status, diff, log |
| **Git Commit** | git add, commit |
| **All Playwright** | All browser automation tools |
| **API Testing** | curl |

## Always Blocked Operations

The following operations are **always denied** regardless of permission settings, to protect your system:

- `rm -rf` / `rm -r` — Recursive deletion
- `sudo`, `chmod`, `chown` — Privilege escalation
- `git push`, `git reset --hard`, `git clean` — Destructive Git operations
- Shell redirects that overwrite files (`>`)
- `dd`, `mkfs` — Low-level filesystem operations
- Unsafe command piping (`wget | sh`)

## Default Permissions by Template

| Template | Defaults |
|----------|----------|
| **vite-frontend** | All file ops, all npm commands, all Playwright tools, read-only bash |
| **nestjs-backend** | All file ops, all npm commands, curl, no browser automation |

See also: [Session Execution](session-execution.md#permission-prompts) for how permission prompts appear during execution.
