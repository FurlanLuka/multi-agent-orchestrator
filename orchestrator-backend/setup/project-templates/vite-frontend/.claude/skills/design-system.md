---
name: design-system
description: Create theme configuration and wrapped base components. Use when user asks about theming, design system, or creating reusable UI components.
---

# Design System

Wrap Mantine components for consistency across the app.

## Orchy-Generated Design (ui_mockup/)

**If this project has a `ui_mockup/` folder, it contains the authoritative design system.**

### What to Read

1. **`ui_mockup/AGENTS.md`** - Integration instructions
2. **`ui_mockup/theme.css`** - CSS variables (colors, spacing, typography, effects)
3. **`ui_mockup/*.html` page mockups** - **THE MAIN REFERENCE** for both layout AND component styles

The page mockups (landing-page.html, docs.html, etc.) are the authoritative source. They show:
- Page layout structure
- Component styling (buttons, cards, forms, navigation)
- Spacing and typography in context
- Color usage patterns

### Integrating with Mantine Theme

Extract CSS variables from `ui_mockup/theme.css` and map to Mantine theme:

```typescript
// src/design-system/theme/index.ts
import { createTheme, MantineColorsTuple } from '@mantine/core';

// Extract color values from ui_mockup/theme.css
// Look for --primary-50 through --primary-900 (or similar naming)
const primary: MantineColorsTuple = [
  // Copy the 10 color values from theme.css primary scale
  '#...', '#...', '#...', '#...', '#...',
  '#...', '#...', '#...', '#...', '#...',
];

export const theme = createTheme({
  colors: { primary },
  primaryColor: 'primary',
  fontFamily: '...', // from --font-family-base in theme.css
  defaultRadius: 'md', // map from --radius-md in theme.css
});
```

### Creating Components

When creating wrapped components, **look at how they're styled in the page mockups**:

1. Open a page mockup (e.g., `ui_mockup/landing-page.html`)
2. Find the component you need (button, card, input, etc.)
3. Note its styling (colors, padding, border-radius, shadows)
4. Implement using Mantine props to match that styling

```tsx
// Example: If landing-page.html shows buttons with rounded corners and primary color
export function Button({ children, ...props }: Props) {
  return (
    <MantineButton
      radius="md"  // Match the mockup's border-radius
      // Apply other styling seen in the mockup
      {...props}
    >
      {children}
    </MantineButton>
  );
}
```

### Building Pages

When creating a page, use its corresponding mockup as the blueprint:
- Match the section structure (header, hero, content, footer)
- Match component placement and spacing
- Use the same visual hierarchy

**The mockups define the design - translate them to React/Mantine.**

---

## CRITICAL: No CSS Files

**Never create separate CSS files unless absolutely necessary.** All styling is done through:

1. **Mantine props** - `mt="md"`, `c="dimmed"`, `size="lg"`, etc.
2. **`style` prop** - Inline styles for custom overrides
3. **Design system wrappers** - Pre-styled components in this folder

```tsx
// ✅ Good - Mantine props + style prop
<Card p="lg" style={{ borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>

// ❌ Bad - CSS file
import './Card.css';  // NEVER DO THIS
```

## Theme Configuration

```typescript
// src/design-system/theme/index.ts
import { createTheme } from '@mantine/core';

export const theme = createTheme({
  primaryColor: 'blue',
  fontFamily: 'Inter, system-ui, sans-serif',
  defaultRadius: 'md',
  components: {
    Button: {
      defaultProps: {
        size: 'sm',
      },
    },
    TextInput: {
      defaultProps: {
        size: 'sm',
      },
    },
  },
});
```

Apply in main.tsx:
```tsx
import { theme } from './design-system/theme';

<MantineProvider theme={theme}>
```

## Base Components

Wrap Mantine components to enforce consistency:

```tsx
// src/design-system/components/Button.tsx
import { Button as MantineButton, ButtonProps } from '@mantine/core';

interface Props extends ButtonProps {
  onClick?: () => void;
}

export function Button({ children, ...props }: Props) {
  return (
    <MantineButton {...props}>
      {children}
    </MantineButton>
  );
}
```

```tsx
// src/design-system/components/Card.tsx
import { Paper, PaperProps } from '@mantine/core';
import { CSSProperties } from 'react';

interface Props extends PaperProps {
  children: React.ReactNode;
  elevated?: boolean;
}

export function Card({ children, elevated, style, ...props }: Props) {
  const cardStyle: CSSProperties = {
    ...style,
    ...(elevated && { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }),
  };

  return (
    <Paper p="md" radius="md" withBorder style={cardStyle} {...props}>
      {children}
    </Paper>
  );
}
```

```tsx
// src/design-system/components/Layout.tsx
import { AppShell, Container } from '@mantine/core';

interface Props {
  children: React.ReactNode;
}

export function Layout({ children }: Props) {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        {/* Header content */}
      </AppShell.Header>
      <AppShell.Main>
        <Container size="lg">
          {children}
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}
```

## Directory Structure

```
src/design-system/
├── theme/
│   └── index.ts      # Mantine theme config
└── components/
    ├── index.ts      # Export all
    ├── Button.tsx
    ├── Card.tsx
    ├── Input.tsx
    └── Layout.tsx
```

## Export Components

```typescript
// src/design-system/components/index.ts
export { Button } from './Button';
export { Card } from './Card';
export { Layout } from './Layout';
```

## Usage

```tsx
import { Button, Card } from '../design-system/components';

function MyComponent() {
  return (
    <Card>
      <Button onClick={handleClick}>Click me</Button>
    </Card>
  );
}
```
