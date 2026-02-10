---
name: add-page
description: Add a new page/feature. Use when creating new pages or feature modules.
---

# Add Page/Feature

## Principle: Composition Over Growth

Every page and feature is built by **composing small, focused components** — never by growing a single file. When a component gets complex, the answer is always to extract smaller components and compose them, not to add more code.

## Steps

1. Create feature folder: `src/features/<feature-name>/`
2. Create page component(s) — composition only
3. Extract each section into its own file
4. Add route in `App.tsx`
5. Create server-state hooks if needed

## Feature Structure

Feature folders are **flat** — all files at the feature root. No `components/` subfolder.

```
src/features/<feature-name>/
├── <Feature>Page.tsx           # Main page (composition only, <150 lines)
├── <Feature>DetailsPage.tsx    # Detail page (if needed)
├── <Section>Section.tsx        # One file per visual section
├── <Feature>Header.tsx         # Header component (if needed)
├── <Feature>Info.tsx           # Info display component (if needed)
├── <Feature>FormModal.tsx      # Modal forms (if needed)
└── types.ts                    # Feature-specific types (if needed)
```

## Conventions

### Pages

- Pages are **composition only** — they import and arrange child components
- Pages must **NOT** define section components inline (no function declarations for sections inside a page file)
- Page files should be **~150 lines max** — if longer, extract components
- Business logic goes in hooks and child components
- Use `<Container size="xl" py="xl">` as page wrapper
- Styles must be inline in props — never extract to `const styles` objects. Repeated styles = extract a reusable component instead

### Section Decomposition (MANDATORY)

**One section = one file. No exceptions.**

Every visually distinct section of a page must be its own `*Section.tsx` file. The page file only composes them — imports + JSX arrangement, nothing else.

Examples of sections: hero banners, feature grids, pricing tables, stats overviews, filter bars, content panels, CTAs, footers.

Page file pattern:

```tsx
export function FeaturePage() {
  return (
    <>
      <SectionA />
      <SectionB />
      <SectionC />
    </>
  );
}
```

**Never** define section components as inline functions inside a page file.

### File Size Limit

No component file should exceed **300 lines**. If a file grows beyond this, extract sub-components into their own files at the feature root.

### Selective Subfolders

The default is always **flat**. Only create a subfolder when a feature has a truly distinct sub-feature with its own set of components, hooks, and utils (3+ files that only relate to each other).

```
features/machines/
├── MachinesPage.tsx
├── MachineCard.tsx
├── MachineFilters.tsx
├── manual-board/              # Distinct sub-feature with its own components
│   ├── ManualBoardPage.tsx
│   ├── BoardColumn.tsx
│   └── BoardCard.tsx
```

### No Prop Drilling — Compose Instead

If a component receives props only to forward them to children, the composition is wrong. Restructure so the parent composes the children directly.

**Signs of prop drilling:**
- A component forwards 4+ props it doesn't use itself
- Callback chains: `Parent → Wrapper → Child` where Wrapper just relays `onSomething`
- Loading/state props passed alongside their callbacks (`onDelete` + `isDeleting`)

**Fix with composition (prefer in order):**
1. **`children` prop** — let the parent compose the child directly, skipping the middle layer
2. **Custom hooks** — extract data fetching + mutation logic into a hook, call it where the data is needed
3. **Context** — last resort, for truly cross-cutting state (auth, theme)

### Feature Components

- Keep feature-specific components in the feature folder (flat)
- Move to `shared-components/` only when the component meets ALL 3 criteria in the [shared-components skill](./shared-components.md): used by 2+ **unrelated** features, generic primitive, could exist in any project
- Domain components shared by related features live in the primary feature folder — see [Related Features Pattern](./shared-components.md#related-features-pattern)

### Naming

- `*Page.tsx` — route-level components
- `*Section.tsx` — visual page sections
- `*Header.tsx` — header components
- `*Info.tsx` — info display components
- `*Modal.tsx` — modal dialogs
- `*Form.tsx` — form components

## Routing

```tsx
// App.tsx
import { FeaturePage } from './features/feature/FeaturePage';

<Routes>
  <Route path="/feature" element={<FeaturePage />} />
  <Route path="/feature/:id" element={<FeatureDetailsPage />} />
</Routes>
```
