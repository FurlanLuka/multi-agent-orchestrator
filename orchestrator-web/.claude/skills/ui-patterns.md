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
| `FormCard` | Form pages with warm header/footer zones |
| `TabbedCard` | Card with tabs in warm header zone |
| `StyledModal` | Modals with warm header/footer zones |
| `EmptyState` | Consistent empty state display |
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

### Form Pages (prompt, createWorkspace, quickstart, ad-hoc)

Use `FormCard` with header/footer zones for a modal-like appearance:

```tsx
<Container size="sm" py="xl">
  <FormCard
    onBack={onBack}
    title="Page Title"
    footer={
      <Group justify="flex-end">
        <Button variant="subtle" onClick={onBack}>
          Cancel
        </Button>
        <Button onClick={handleSubmit}>
          Submit
        </Button>
      </Group>
    }
  >
    <Stack gap="lg">
      <GlassTextInput label="Name" ... />
      <GlassTextarea label="Description" ... />
    </Stack>
  </FormCard>
</Container>
```

**FormCard props:**
- `title` — String or ReactNode, renders in warm header zone (left-aligned)
- `onBack` — Callback, renders back arrow left of title in header
- `footer` — ReactNode, renders in warm footer zone (typically buttons right-aligned)
- `showHeader` — Boolean, shows empty warm header zone even without title (for visual consistency)

**For complex titles (e.g., workspace name + badges):**
```tsx
<FormCard
  onBack={onBack}
  title={
    <Stack gap="xs">
      <Group gap="xs" align="center">
        <Text fw={600} size="lg">{workspace.name}</Text>
        <ActionIcon variant="subtle" color="gray" size="sm" onClick={onEdit}>
          <IconSettings size={16} />
        </ActionIcon>
      </Group>
      <Group gap="xs">
        {workspace.projects.map(p => (
          <Badge key={p} variant="light" size="sm">{p}</Badge>
        ))}
      </Group>
    </Stack>
  }
  ...
>
```

**Key rules:**
- Titles are LEFT-aligned, not centered
- Back arrow is IN the header zone, left of title
- Footer has Cancel + Primary button, right-aligned
- Use `gap="lg"` inside FormCard content
- **Always use `showHeader` for visual consistency** — all form cards should have the warm header zone, even if empty

### Modals (StyledModal)

Use `StyledModal` for consistent modal styling with warm header/footer:

```tsx
<StyledModal
  opened={isOpen}
  onClose={onClose}
  title="Modal Title"
  size="md"
  footer={
    <Group justify="flex-end">
      <Button variant="subtle" onClick={onClose}>
        Cancel
      </Button>
      <Button onClick={handleSubmit}>
        Submit
      </Button>
    </Group>
  }
>
  <Stack gap="md">
    {/* Modal content */}
  </Stack>
</StyledModal>
```

**StyledModal props:**
- `title` — String, renders in warm header zone with close button
- `footer` — ReactNode, renders in warm footer zone
- Extends Mantine Modal props (opened, onClose, size, etc.)

### Empty States

Use `EmptyState` for consistent empty state display:

```tsx
<EmptyState
  icon={<IconFolder size={48} />}
  description="No projects configured yet. Click 'Add Project' to get started."
/>
```

**EmptyState props:**
- `icon` — ReactNode, displayed at 30% opacity
- `title` — Optional string, bold text above description
- `description` — Main message text
- `action` — Optional ReactNode for action button

### Tabbed Cards (TabbedCard)

Use `TabbedCard` for cards with tabs in the header zone (like session Tasks & Tests):

```tsx
const [activeTab, setActiveTab] = useState('tab1');

<TabbedCard
  tabs={[
    { value: 'tab1', label: <Group gap="xs"><span>Tab 1</span><Badge size="xs">3</Badge></Group> },
    { value: 'tab2', label: 'Tab 2' },
  ]}
  activeTab={activeTab}
  onTabChange={setActiveTab}
>
  {activeTab === 'tab1' && <Tab1Content />}
  {activeTab === 'tab2' && <Tab2Content />}
</TabbedCard>
```

**TabbedCard props:**
- `tabs` — Array of `{ value: string, label: ReactNode }`
- `activeTab` — Currently selected tab value
- `onTabChange` — Callback when tab changes
- Tab labels can be ReactNodes (e.g., with badges)

### Collapsible Section Titles

For section titles that can collapse/expand their content:

```tsx
const [showSection, setShowSection] = useState(true);

<UnstyledButton onClick={() => setShowSection(!showSection)}>
  <Group gap={4}>
    <ThemeIcon size="xs" variant="transparent" color="gray">
      {showSection ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
    </ThemeIcon>
    <Text size="sm" fw={600} c="dimmed" tt="uppercase">
      Section Title
    </Text>
  </Group>
</UnstyledButton>

<Collapse in={showSection}>
  {/* Section content (cards, etc.) */}
</Collapse>
```

**Pattern notes:**
- Title is uppercase, dimmed, small text
- Chevron indicates state: down = expanded, right = collapsed
- Use `UnstyledButton` for clickable title (not `Button`)
- Wrap content in `Collapse` component
- Used in SessionView for: Current Feature, Tasks & Tests, Project Tracking

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

No AppShell — uses simple Box/Container with inline header. Two-column layout with collapsible sections.

**Left Panel (span 5):**
- "Planning Agent" section title (collapsible)
- Chat card with warm header (status badge only) and footer (ChatInput)

**Right Panel (span 7):**
- "Current Feature" section title (collapsible) → Feature card with warm header
- "Tasks & Tests" section title (collapsible) → TabbedCard with project tabs
- "Project Tracking" section title (collapsible) → TabbedCard with project tabs

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
          <Title order={3}>Orchy</Title>
        </Group>
        <Button variant="subtle" color="rose" leftSection={<IconPlayerStop size={16} />}>
          Stop Session
        </Button>
      </Group>

      {/* Two-column grid */}
      <Grid gutter="lg" style={{ flex: 1, minHeight: 0 }}>
        <Grid.Col span={5}>
          {/* Collapsible section title + Chat panel */}
        </Grid.Col>
        <Grid.Col span={7}>
          <ScrollArea>
            {/* Collapsible sections: Feature, Tasks & Tests, Project Tracking */}
          </ScrollArea>
        </Grid.Col>
      </Grid>
    </Stack>
  </Container>
</Box>
```

Stop Session button requires confirmation modal before ending session.

### Session Chat Panel

The planning agent chat uses warm header/footer zones (matching FormCard/StyledModal):

```tsx
<GlassCard p={0} h="calc(100vh - 100px)" style={{ overflow: 'hidden' }}>
  {/* Warm Header */}
  <Group
    justify="space-between"
    px="lg"
    py="md"
    style={{
      background: glass.modalZone.bg,
      borderBottom: glass.modalZone.border,
    }}
  >
    <Group gap="xs">
      <ThemeIcon size="sm" radius="md" variant="light" color="peach">
        <IconMessageCircle size={14} />
      </ThemeIcon>
      <Text fw={600} size="sm">Planning Agent</Text>
    </Group>
    <Badge color={isStreaming ? 'peach' : 'gray'} variant="light" size="sm">
      {isStreaming ? 'Thinking...' : 'Ready'}
    </Badge>
  </Group>

  {/* Chat content... */}

  {/* Warm Footer with Input */}
  <Box
    px="lg"
    py="md"
    style={{
      background: glass.modalZone.bg,
      borderTop: glass.modalZone.border,
    }}
  >
    <ChatInput ... />
  </Box>
</GlassCard>
```

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
- **Use `GlassRichTextEditor` for multi-line text inputs** (feature descriptions, prompts) — provides WYSIWYG editing
- When using `GlassRichTextEditor` alongside `GlassTextInput`, use default size (no `size="md"`) for consistent label sizes
- Add `description` prop for helper text below labels

**GlassRichTextEditor usage:**
```tsx
import { GlassRichTextEditor, useGlassEditor } from '../../theme';

const editor = useGlassEditor({
  placeholder: 'Describe what to build...',
});

const hasContent = editor ? editor.getText().trim().length > 0 : false;

<GlassRichTextEditor
  label="Feature Description"
  description="Optional helper text"
  editor={editor}
/>
```

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
