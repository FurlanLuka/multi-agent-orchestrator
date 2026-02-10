# Design Mode

Design Mode lets you create a complete design system through an interactive conversation with a Designer Agent.

---

## Workflow

### 1. Category Selection

Choose from 8 design categories:

- Blog
- Landing Page
- E-commerce
- Dashboard
- Documentation
- Portfolio
- Chat / Messaging
- SaaS Marketing

Each category comes with tailored reference examples, component definitions, and layout approaches that guide the agent's design decisions.

### 2. Discovery Phase

Chat with the Designer Agent about your project's visual needs, brand identity, target audience, and design preferences. The agent asks questions to understand your requirements. When ready, it presents a **discovery summary** for your approval.

- **Approve** — Move to theme generation
- **Continue chatting** — Refine requirements further

### 3. Theme Generation

The agent generates 3 CSS-only theme options (color palettes and typography as CSS variables). You can:

- **Select** a theme
- **Refine** a theme with feedback
- **Request new options**

You also choose a **theme mode**: light only, dark only, or both (with a toggle mechanism).

### 4. Mockup Generation

Full-page mockups are generated as HTML with structured markup. The agent produces 3 options per page, each using a different layout approach (e.g., cinematic, bento grid, split layout, editorial). You can:

- Select from the options
- Enter **Refine Mode** for side-by-side editing
- Request entirely new options

Mockups use structured conventions for easy extraction:
- `data-section` attributes identify page sections
- `data-component` attributes identify reusable components
- `oc-*` CSS class prefix for component styles (e.g., `.oc-button`, `.oc-card__title`)
- Component CSS is marked with `/* === COMPONENT: {id} === */` delimiters

### 5. Pages

Create multiple pages for your design system. Add pages one at a time, each generated based on your theme and maintaining design consistency. Per-page component catalogs are available for quick reference.

### 6. Complete & Save

When you're done, the agent auto-generates:

- **Component catalog** (`components.html`) — a consolidated reference of all component patterns extracted from your mockups
- **Integration guide** (`AGENTS.md`) — CSS variable documentation, structured markup conventions, usage instructions, and framework integration examples

Name your design and save it to your design library.

## Design Library

Access your saved designs from the **Designs Library** page. Each saved design includes:

- `theme.css` — CSS variables (colors, typography, spacing)
- `components.html` — Consolidated component catalog
- `AGENTS.md` — Integration guide for development agents
- Page mockups as HTML files (e.g., `landing-page.html`, `about.html`)

## Attaching Designs to Projects

In [project settings](projects.md), you can attach a design from your library. When a design is attached, Orchy copies the design files into a `ui_mockup/` directory in the project. The AI agent references these files when implementing UI features:

1. `ui_mockup/AGENTS.md` — Integration instructions and markup conventions
2. `ui_mockup/theme.css` — CSS variables to extract into the project's theme
3. `ui_mockup/components.html` — Component patterns to follow
4. `ui_mockup/*.html` — Page mockups for layout reference
