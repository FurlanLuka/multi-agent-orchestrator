---
name: shared-components
description: Create reusable UI components in shared-components/. Use when building UI that's used across multiple features.
---

# Shared Components

Reusable UI components with consistent styling.

## When to Create

Create in `shared-components/` when:
- Component is used by 2+ features
- Has specific styling beyond Mantine defaults (e.g., styled Button, Card)
- Combines multiple Mantine components into a reusable unit

Keep in `features/<name>/` when:
- Only used within one feature
- Feature-specific styling

## Structure

```
shared-components/
├── index.ts              # Barrel export
└── <Component>.tsx       # Each component
```

## Conventions

1. **Export from index.ts** for clean imports
2. **TypeScript interfaces** for all props
3. **Use Mantine props** for styling - don't create CSS
4. **Keep focused** - one responsibility per component

## Import Pattern

```tsx
import { ComponentName } from '../shared-components';
```

---

## Orchy-Generated Design (ui_mockup/)

If this project has a `ui_mockup/` folder, it's the authoritative design.

### What to Read
1. **`ui_mockup/AGENTS.md`** - Integration instructions
2. **`ui_mockup/theme.css`** - CSS variables
3. **`ui_mockup/*.html` page mockups** - Layout and component reference

### Applying Designs
- Match layouts from page mockups
- Extract colors from theme.css into Mantine theme
- Follow component patterns shown in mockups
