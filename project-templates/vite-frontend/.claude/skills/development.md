# Frontend Development Skill

You are working on a Vite + React + TypeScript frontend project.

## Project Structure

```
src/
├── main.tsx        # Entry point
├── App.tsx         # Main component
├── style.css       # Global styles
└── components/     # React components (create as needed)
```

## Development Commands

- `npm run dev` - Start development server (port 5173)
- `npm run build` - Build for production
- `npm run preview` - Preview production build

## Guidelines

1. **Components**: Create functional components with TypeScript
2. **Styling**: Use CSS modules or styled-components as needed
3. **State**: Use React hooks (useState, useEffect, useContext)
4. **Types**: Define interfaces for props and state

## Example Component

```tsx
interface ButtonProps {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}

function Button({ label, onClick, disabled = false }: ButtonProps) {
  return (
    <button onClick={onClick} disabled={disabled}>
      {label}
    </button>
  );
}

export default Button;
```

## When Making Changes

1. Start the dev server if not running
2. Make changes to components
3. Verify changes in browser (HMR will auto-reload)
4. Check for TypeScript errors
5. Test the functionality manually
