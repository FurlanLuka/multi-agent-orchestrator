---
name: design-system
description: Create theme configuration and wrapped base components. Use when user asks about theming, design system, or creating reusable UI components.
---

# Design System

Wrap Mantine components for consistency across the app.

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

interface Props extends PaperProps {
  children: React.ReactNode;
}

export function Card({ children, ...props }: Props) {
  return (
    <Paper p="md" radius="md" withBorder {...props}>
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
