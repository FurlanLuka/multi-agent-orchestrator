# UI Patterns - orchestrator-web

## Component Structure

Feature folders under `src/components/`:
- `chat/` — ChatInput, ChatMessage, MessageContent
- `layout/` — AppHeader
- `session/` — CompletionPanel, QuickStartCard, SessionView
- `plan/` — TaskList, TestList
- `overlay/` — PermissionOverlay
- `home/` — HomePage, WorkspaceCard, AddWorkspaceCard, PromptScreen, CreateWorkspaceView, FloatingSettingsButton
- `settings/` — SettingsPage, SettingsSidebar, ProjectSettings, WorkspaceSettings

Each component file is self-contained with its own interfaces. No barrel exports.

## State Management

- Global state via `useOrchestrator()` from `context/OrchestratorContext.tsx`
- The context wraps `useSocket()` hook which manages all socket.io communication
- Avoid prop drilling — prefer pulling from context in leaf components when they need many values
- View routing is state-based in `App.tsx` (`View` union type), no router library

## View Navigation

```typescript
type View =
  | { page: 'home' }
  | { page: 'prompt'; workspaceId: string }
  | { page: 'createWorkspace' }
  | { page: 'settings'; tab?: 'projects' | 'workspaces' }
  | { page: 'session' };
```

- `home` — workspace grid, no AppShell header
- `prompt` — full-screen centered prompt for a workspace
- `createWorkspace` — full-screen workspace creation form
- `settings` — sidebar layout with project/workspace management
- `session` — AppShell with header, split chat/status panels

Session start auto-navigates to `session` via useEffect.

## Workspaces

- Stored in `~/.aio-config/workspaces.json` (separate from projects.json)
- `WorkspaceConfig` type: id, name, projects[], context?, timestamps
- Context is prepended to feature description when starting a session
- CRUD via socket events: getWorkspaces, createWorkspace, updateWorkspace, deleteWorkspace

## UI Library

- Mantine v8 component library
- `@mantine/tiptap` for rich text editing (feature descriptions)
- `@tabler/icons-react` for icons

## Conventions

- Terminal/code blocks use `#1e1e1e`
- Permission overlays use `rgba(0,0,0,0.94)`
- Use `var(--mantine-color-default-border)` for borders
- Status colors: green=complete, blue=working, yellow=debugging, red=failed, violet=e2e/git
- Badge variants: `light` for status indicators, `filled` for actions
