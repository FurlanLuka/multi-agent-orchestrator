# UI Patterns - orchestrator-web

## Design System: "Glass Warmth"

A warm, frosted-glass aesthetic with soft peach accents on a creamy gradient background.

### Theme Location

All theming is in `src/theme/`:
- `tokens.ts` — color palettes, glass properties, text colors, radii
- `theme.ts` — Mantine theme configuration
- `Glass*.tsx` — wrapper components for consistent styling
- `index.ts` — re-exports everything

### Color Palette

Five semantic colors, each a 10-shade Mantine tuple:

| Name | Usage | Hex Range |
|------|-------|-----------|
| `peach` | Primary, working states, links | `#fff5f2` → `#833524` |
| `sage` | Success, complete states | `#f2f8f2` → `#224d22` |
| `rose` | Error, failed states | `#fef2f2` → `#7a2020` |
| `honey` | Warning, debugging states | `#fef8ef` → `#6b4818` |
| `lavender` | Info, E2E testing, git | `#f5f3fc` → `#412c70` |

Use via Mantine: `color="peach"`, `c="sage.6"`, etc.

### Text Colors

Warm brown-grays instead of cool defaults. Use CSS variables:

```css
--text-heading: #3a3230    /* Titles, headings */
--text-body: #4a4340       /* Main content */
--text-label: #5c504a      /* Form labels */
--text-dimmed: #9a8e86     /* Secondary text, descriptions */
--text-placeholder: #b8a8a0
```

### Glass Components

Import from `../../theme`:

| Component | Purpose |
|-----------|---------|
| `GlassCard` | Main content cards, clickable items |
| `GlassSurface` | Subtle panels, chat containers |
| `GlassBar` | Top/bottom floating bars |
| `GlassDashedCard` | "Add new" placeholder cards |
| `GlassTextInput` | Text inputs |
| `GlassTextarea` | Multi-line inputs |
| `GlassSelect` | Dropdown select |
| `GlassMultiSelect` | Multi-select |
| `GlassSwitch` | Toggle switches |
| `GlassCheckbox` | Checkboxes |
| `GlassSegmentedControl` | Tab-like selection |
| `GlassRichTextEditor` | Tiptap-based rich text |

### Page Background

Set in `index.css`:
```css
background: linear-gradient(145deg, #fef9f7 0%, #f5f0ed 40%, #f0ebe8 100%);
```

---

## Page Layout Patterns

### Centered Form Pages (home, prompt, createWorkspace, quickstart)

Clean, centered layout without AppShell:

```tsx
<Container size="sm" py="xl">
  <Stack gap="xl">
    <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBack}>
      <IconArrowLeft size={20} />
    </ActionIcon>

    <Stack align="center" gap={4}>
      <Title order={2} ta="center" style={{ letterSpacing: '-.02em' }}>
        Page Title
      </Title>
      <Text c="dimmed" size="sm" ta="center">
        Subtitle description
      </Text>
    </Stack>

    {/* Form inputs directly in stack - NO cards wrapping them */}
    <GlassTextInput label="Name" ... />
    <GlassTextarea label="Description" ... />

    <Button size="lg" fullWidth>
      Action
    </Button>
  </Stack>
</Container>
```

**Key rules:**
- Back button is just `ActionIcon` with arrow, no text
- Title centered, no icon above it
- Inputs directly in Stack, NOT wrapped in cards
- Use `gap="xl"` between major sections

### Selectable Card Grid (component selection, workspace cards)

When items are selectable, wrap them in `GlassCard`:

```tsx
<SimpleGrid cols={{ base: 1, xs: 2 }} spacing="sm">
  {items.map(item => {
    const isSelected = selectedItems.includes(item.id);
    return (
      <GlassCard
        key={item.id}
        p="sm"
        style={{
          cursor: 'pointer',
          border: isSelected
            ? '2px solid var(--mantine-color-peach-5)'
            : '1px solid var(--border-subtle)',
          opacity: isSelected ? 1 : 0.7,
          transition: 'all 0.15s ease',
        }}
        onClick={() => toggle(item.id)}
      >
        {/* Card content */}
      </GlassCard>
    );
  })}
</SimpleGrid>
```

### Session View

No AppShell — uses simple Box/Container with inline header:

```tsx
<Box style={{ minHeight: '100vh' }}>
  <Container size="100%" py="md" h="100vh">
    <Stack gap="md" h="100%">
      {/* Simple header row */}
      <Group justify="space-between" px="xs">
        <Group gap="sm">
          <ThemeIcon size="lg" radius="md" color="peach" variant="light">
            <IconRocket size={20} />
          </ThemeIcon>
          <Title order={3}>AIO Orchestrator</Title>
        </Group>
        <Button variant="subtle" color="rose" leftSection={<IconPlayerStop size={16} />}>
          Stop Session
        </Button>
      </Group>

      {/* Two-column grid */}
      <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
        <Grid.Col span={5}>{/* Chat panel */}</Grid.Col>
        <Grid.Col span={7}>{/* Status panel */}</Grid.Col>
      </Grid>
    </Stack>
  </Container>
</Box>
```

Stop Session button requires confirmation modal before ending session.

---

## Component Structure

Feature folders under `src/components/`:

| Folder | Components |
|--------|------------|
| `home/` | HomePage, WorkspaceCard, AddWorkspaceCard, PromptScreen, AdHocPromptScreen, QuickStartView, CreateWorkspaceView, FloatingSettingsButton |
| `session/` | SessionView, CompletionPanel |
| `chat/` | ChatInput, ChatMessage, AssistantChat |
| `layout/` | AppHeader |
| `plan/` | TaskList, TestList, TabbedPlanView |
| `settings/` | SettingsPage, SettingsSidebar, ProjectSettings, WorkspaceSettings |

Each component is self-contained with its own interfaces. No barrel exports.

---

## View Navigation

State-based routing in `App.tsx`:

```typescript
type View =
  | { page: 'home' }
  | { page: 'prompt'; workspaceId: string }
  | { page: 'prompt-adhoc' }
  | { page: 'quickstart' }
  | { page: 'createWorkspace' }
  | { page: 'settings'; tab?: SettingsTab }
  | { page: 'session' };
```

Session start auto-navigates to `session` via useEffect.

---

## State Management

- Global state via `useOrchestrator()` from `context/OrchestratorContext.tsx`
- Context wraps `useSocket()` which manages all socket.io communication
- Avoid prop drilling — pull from context in leaf components when needed

---

## Status Colors

| Status | Color | Usage |
|--------|-------|-------|
| Pending | `gray` | Not started |
| Working | `peach` | In progress |
| Verifying | `peach` | Build/install check |
| Debugging/Fixing | `honey` | Retrying after error |
| Complete/Passed | `sage` | Success |
| Failed | `rose` | Error |
| E2E/Testing | `lavender` | Running tests |

---

## Form Input Consistency

- Don't mix `size="md"` inputs with default size — keep consistent within a page
- When using `GlassRichTextEditor` alongside `GlassTextInput`, use default size (no `size="md"`) for consistent label sizes
- Add `description` prop for helper text below labels

---

## Links and Actions

For inline text links:
```tsx
<Text c="dimmed" size="sm">
  <Text span c="peach.6" fw={500} style={{ cursor: 'pointer' }} onClick={...}>
    Action link
  </Text>
  {' or '}
  <Text span c="peach.6" fw={500} style={{ cursor: 'pointer' }} onClick={...}>
    another action
  </Text>
</Text>
```

---

## Icons

Use `@tabler/icons-react`. Common icons:
- `IconArrowLeft` — back navigation
- `IconRocket` — start/launch actions
- `IconSettings` — settings
- `IconGitBranch` — git-related
- `IconBrowser` — frontend
- `IconServer` — backend
