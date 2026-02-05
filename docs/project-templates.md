# Project Templates

Orchy includes built-in templates for rapid project scaffolding.

---

## vite-frontend

A React frontend project with:

- React 19 + TypeScript
- Vite bundler
- Mantine UI component library
- TanStack React Query for data fetching
- React Router for navigation
- Pre-configured dev server on port 5173
- Playwright browser automation for E2E testing

## nestjs-backend

A NestJS backend project with:

- NestJS 11 + TypeScript
- Prisma ORM with SQLite
- Input validation (class-validator)
- Pre-configured dev server on port 3000 (watch mode)
- Database migration and seeding commands
- curl-based E2E testing

## What Templates Set Up

When you create a [workspace](workspaces.md) from a template:

1. Project directories are created
2. Dependencies are installed
3. Dev server, build, and install commands are configured
4. [Permissions](permissions.md) are set to sensible defaults
5. E2E testing is configured
6. For fullstack templates, project dependencies are set (frontend E2E waits for backend)

---

← [Dev Servers](dev-servers.md) | [Notifications →](notifications.md)
