---
name: shared-components
description: Create generic UI primitives in shared-components/. Use ONLY for components reusable across unrelated features (buttons, cards, badges).
---

# Shared Components

Generic UI primitives with consistent styling — shared across **unrelated** features.

## What Belongs

Only generic, domain-agnostic UI primitives. Examples (not exhaustive — any component that passes all 3 conditions in "When to Create" qualifies):

- `Button`, `IconButton` — styled action triggers
- `Card`, `InfoCard`, `StatCard` — content containers
- `Badge`, `StatusBadge`, `Tag` — labels and indicators
- `Input`, `SearchInput`, `Select` — form controls beyond Mantine defaults
- `DataTable`, `SortableTable` — table components
- `EmptyState`, `LoadingState`, `ErrorState` — state placeholders
- `ConfirmationModal`, `AlertDialog` — generic dialogs
- `Avatar`, `Tooltip`, `Breadcrumb` — utility UI elements
- `PageHeader`, `SectionHeader` — generic layout headers

**Rule**: If you can imagine the component in a completely different project with zero changes, it belongs here.

## What Does NOT Belong

Domain-specific components — even if used by multiple features. Examples (not exhaustive — any component that fails the 3-condition test does not belong):

- `DocsSidebar`, `DocsHeader`, `DocsBreadcrumb` — docs domain
- `UserCard`, `UserAvatar` — user domain
- `OperationDetailsContent`, `MachineStatusCard` — operations domain
- `OrderSummaryCard`, `CartItemRow` — ecommerce domain
- `ChatMessageBubble`, `ConversationList` — messaging domain

**Rule**: If the component name contains a feature or domain name, it almost certainly does **NOT** belong in `shared-components/`. It belongs in `features/<domain>/`. Always apply the 3-condition test from "When to Create" — the lists above are examples to illustrate the pattern, not a closed set.

## When to Create

Create in `shared-components/` when **ALL 3** conditions are true:

1. **Used by 2+ unrelated features** — docs and docs-admin are *related* (doesn't count); docs and settings are *unrelated* (counts)
2. **Generic UI primitive** — has zero domain knowledge, accepts generic props like `title`, `description`, `onClick`
3. **Could exist in any project** — the component makes sense without any specific business context

If any condition is false, the component belongs in a feature folder.

## Related Features Pattern

When related features (e.g., `docs` + `docs-admin`) share components, those components live in the **primary** feature folder — not in `shared-components/`. The secondary feature imports via relative path.

```
features/docs/
├── DocsPage.tsx
├── DocsSidebar.tsx         # shared with docs-admin — lives here
├── DocsHeader.tsx          # shared with docs-admin — lives here
├── DocsBreadcrumb.tsx      # docs only
features/docs-admin/
├── DocsAdminPage.tsx
├── DocsTreeNav.tsx         # docs-admin only
├── DocsEditorPanel.tsx     # imports DocsSidebar from ../docs/DocsSidebar
```

Import pattern for related features:
```tsx
// In features/docs-admin/DocsAdminPage.tsx
import { DocsSidebar } from '../docs/DocsSidebar';
```

## Structure

```
shared-components/
├── index.ts              # Barrel export
└── <Component>.tsx       # Each component — one file per component
```

## Conventions

1. **Export from index.ts** for clean imports
2. **TypeScript interfaces** for all props
3. **Use Mantine props** for styling — don't create CSS
4. **Styles always inline** — write `style` props directly on elements, never extract to a `const styles` object. If the same style repeats, that's a sign the styled element should be its own shared component.
5. **Keep focused** — one responsibility per component
6. **No feature imports** — shared-components must NOT import from `features/`

## Import Pattern

```tsx
import { ComponentName } from '../shared-components';
```

---

## Orchy-Generated Design (ui_mockup/)

If this project has a `ui_mockup/` folder, it's the authoritative design.

### What to Read
1. **`ui_mockup/AGENTS.md`** - Integration instructions and structured markup conventions
2. **`ui_mockup/theme.css`** - CSS variables
3. **`ui_mockup/components.html`** - Component catalog with all component patterns
4. **`ui_mockup/*.html` page mockups** - Layout and component reference

### Applying Designs
- Match layouts from page mockups using `data-section` attributes to identify sections
- Extract component patterns using `data-component` attributes (e.g., `data-component="button"`)
- Component CSS uses `oc-*` class prefix (`.oc-button`, `.oc-card__title`)
- Extract component CSS from between `/* === COMPONENT: {id} === */` markers
- Extract colors from theme.css into Mantine theme
- Use `components.html` as a quick reference for all available component styles
