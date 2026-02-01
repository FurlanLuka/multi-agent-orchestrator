# Vite Frontend

A React frontend with TypeScript, Mantine UI, and React Query.

## Tech Stack

- **Framework**: React 18 + Vite
- **Language**: TypeScript
- **UI Library**: Mantine 7
- **Server State**: React Query (TanStack Query)
- **Routing**: React Router 6
- **HTTP Client**: Axios

## Project Structure

```
src/
├── main.tsx             # Entry point (providers setup)
├── App.tsx              # Root component
├── design-system/       # Theme and base components
│   ├── theme/           # Mantine theme config
│   └── components/      # Wrapped base components
├── pages/               # Page components (composition only)
├── components/          # Feature components with business logic
│   └── <page-name>/     # Components for specific page
└── server-state/        # React Query hooks and API
    ├── apiClient.ts     # Axios instance
    ├── queryKeys.ts     # Query key factory
    └── <feature>.ts     # Feature hooks
```

## Commands

```bash
npm run dev      # Start dev server (port 5173)
npm run build    # Build for production
npm run preview  # Preview production build
```

## Design System

**All styled base components (buttons, inputs, cards, links) go in `design-system/components/`**

1. Check if component exists in `design-system/components/`
2. If not, create a wrapper there with the project's theme styling
3. Import and use in feature code - never apply theme styles inline

**Wrap these Mantine components in design-system:**
- Button, ActionIcon → themed buttons
- TextInput, Textarea, Select → themed inputs
- Card, Paper → themed containers
- Anchor → themed links

## Styling Rules

1. **Mantine props first** - `mt="md"`, `c="dimmed"`, `size="lg"`
2. **Design system for theming** - colors, fonts, borders → wrap in `design-system/`
3. **`style` prop for layout only** - flex, gap, positioning

**Never do:**
- Inline `styles={{}}` or `style={{}}` for colors/fonts/borders - put in design-system
- `<Text onClick>` or `<Group onClick>` as buttons - use Button component
- CSS files

## Guidelines

1. **Use Mantine** for all UI components
2. **Semantic HTML** - Button for buttons, Anchor for links
3. **Design system first** - all themed components wrapped in `design-system/`
4. **Pages are composition only** - no business logic
5. **Components contain logic** - forms, data fetching
6. **React Query for server state** - no useState for API data
