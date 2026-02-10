---
name: add-page
description: Add a new page/feature. Use when creating new pages or feature modules.
---

# Add Page/Feature

## Steps

1. Create feature folder: `src/features/<feature-name>/`
2. Create page component(s)
3. Add route in `App.tsx`
4. Create server-state hooks if needed

## Feature Structure

```
src/features/<feature-name>/
├── <Feature>Page.tsx           # Main page
├── <Feature>DetailsPage.tsx    # Detail page (if needed)
├── <Feature>FormModal.tsx      # Modal forms (if needed)
└── <other components>.tsx
```

## Conventions

### Pages
- Pages are composition - they arrange components and handle routing
- Business logic goes in hooks and child components
- Use `<Container size="xl" py="xl">` as page wrapper

### Feature Components
- Keep feature-specific components in the feature folder
- Move to `shared-components/` only when used by 2+ features

### Naming
- `*Page.tsx` - route-level components
- `*Modal.tsx` - modal dialogs
- `*Form.tsx` - form components

## Routing

```tsx
// App.tsx
import { FeaturePage } from './features/feature/FeaturePage';

<Routes>
  <Route path="/feature" element={<FeaturePage />} />
  <Route path="/feature/:id" element={<FeatureDetailsPage />} />
</Routes>
```
