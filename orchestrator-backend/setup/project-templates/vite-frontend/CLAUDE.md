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

## Guidelines

1. **Use Mantine** for all UI components unless user requests otherwise
2. **Pages are composition only** - no business logic, just layout and component assembly
3. **Components contain logic** - forms, modals, data fetching
4. **React Query for server state** - no useState for API data
5. **Design system first** - wrap Mantine components for consistency
