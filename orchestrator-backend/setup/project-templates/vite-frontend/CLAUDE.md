# Vite Frontend

React frontend with TypeScript, Mantine UI, and React Query.

## Tech Stack
- React 19 + Vite
- TypeScript
- Mantine 8
- React Query (TanStack Query)
- React Router 7
- Axios

## Project Structure

```
src/
├── main.tsx                  # Entry point (providers)
├── App.tsx                   # Root routing
├── features/                 # Feature modules
│   └── <feature>/            # Self-contained: pages + components + modals
├── shared-components/        # Reusable UI with specific styling
├── hooks/                    # Custom React hooks
├── server-state/             # React Query hooks and API
│   ├── apiClient.ts
│   └── <feature>.ts
├── contexts/                 # Global context providers
└── utils/                    # Pure utility functions
```

## Guidelines

1. **Use Mantine directly** - no wrapper components
2. **features/** - each feature is self-contained (pages, modals, components)
3. **shared-components/** - reusable UI used by 2+ features
4. **Mantine props for styling** - `mt="md"`, `c="dimmed"`, `gap="xl"`
5. **Layout components** - `Grid`, `Stack`, `Group`, `Flex`, `Box` for positioning
6. **`style` prop** - for custom styles (colors, shadows, borders)
7. **React Query** - for all server state

## Styling

- Use Mantine component props for styling (`mt="md"`, `c="dimmed"`)
- Use `style` prop for custom styles (colors, shadows, borders)
- Use `Grid`, `Stack`, `Group`, `Flex`, `Box` for layout and positioning
- No CSS files

## Never Do
- Create CSS files for regular component styling
- Use `style` prop for layout - use layout components instead
- Put business logic in page components
- Use useState for API data
