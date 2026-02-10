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
│   └── <feature>/            # Flat: pages, sections, modals, domain components
├── shared-components/        # Generic UI primitives ONLY (Button, Card, Badge, etc.)
├── hooks/                    # Custom React hooks
├── server-state/             # React Query hooks and API
│   ├── apiClient.ts
│   └── <feature>.ts
├── contexts/                 # Global context providers
└── utils/                    # Pure utility functions
```

## Component Placement Rules

| Scenario | Location |
|---|---|
| Used by one feature only | `features/<name>/` (flat) |
| Generic primitive, 2+ unrelated features | `shared-components/` |
| Domain component shared by related features | Primary feature folder (flat), imported via relative path |

## Core Principle: Composition

**Composition drives everything.** Every UI is built by combining small, focused components — never by growing large ones. When in doubt, extract a new component.

This principle is why:
- Pages only compose child components — they never define UI inline
- Each section is its own file — composed into the page
- Repeated styles become a shared component — not a styles constant
- Prop drilling is solved by composing with `children` — not by threading props down
- Shared components are generic primitives — composed into any feature without domain knowledge

## Guidelines

1. **Composition first** — solve every problem by composing small components, not by adding code to existing ones
2. **Use Mantine directly** — no wrapper components
3. **features/** — each feature is self-contained (pages, sections, modals, domain components)
4. **Feature folders are flat** — no `components/` subfolder (see add-page skill for exceptions)
5. **Pages are composition only** — import and arrange child components, never define sections inline
6. **One section = one file** for multi-section pages
7. **shared-components/** — ONLY for generic UI primitives (buttons, cards, inputs, etc. — any component passing all 3 criteria in the shared-components skill). No domain components.
8. **Related features share via primary feature folder** (flat), not shared-components/
9. **Mantine props for styling** — `mt="md"`, `c="dimmed"`, `gap="xl"`
10. **Layout components** — `Grid`, `Stack`, `Group`, `Flex`, `Box` for positioning
11. **`style` prop** — for custom styles (colors, shadows, borders)
12. **React Query** — for all server state

## Styling

- Use Mantine component props for styling (`mt="md"`, `c="dimmed"`)
- Use `style` prop for custom styles (colors, shadows, borders) — always inline, never extracted to a `const styles` object
- Use `Grid`, `Stack`, `Group`, `Flex`, `Box` for layout and positioning
- No CSS files
- If the same `style` prop is repeated across multiple elements, that's a signal to extract a shared component instead of a styles constant

## Never Do
- Create CSS files for regular component styling
- Use `style` prop for layout — use layout components instead
- Put business logic in page components
- Use useState for API data
- Define section components inline in page files
- Put domain-specific components (DocsSidebar, UserCard, etc.) in shared-components/
- Create a component file longer than 300 lines
- Extract styles into `const styles = {}` objects — keep styles inline in props
- Prop drill (pass 4+ props through a component just to forward them) — use composition, custom hooks, or context instead
