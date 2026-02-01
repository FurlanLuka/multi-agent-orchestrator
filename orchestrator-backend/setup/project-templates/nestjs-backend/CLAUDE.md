# NestJS Backend

A NestJS backend with TypeScript, Prisma ORM, and SQLite.

## Tech Stack

- **Framework**: NestJS 10
- **Language**: TypeScript
- **Database**: SQLite via Prisma ORM
- **Validation**: class-validator + class-transformer

## Project Structure

```
src/
├── main.ts              # Entry point (ValidationPipe, CORS)
├── app.module.ts        # Root module
├── shared/              # Global modules
│   └── prisma/          # Database access
└── modules/             # Feature modules
    └── <feature>/
        ├── <feature>.module.ts
        ├── <feature>.controller.ts
        ├── <feature>.service.ts
        └── dto/
prisma/
├── schema.prisma        # Database schema
└── seed.ts              # Seed script
prisma.config.ts         # Prisma 7 configuration
```

## Commands

```bash
# Development
npm run start:dev        # Start with watch mode (port 3000)
npm run build            # Build for production
npm run start:prod       # Run production build

# Database
npm run db:migrate       # Create and apply migration
npm run db:push          # Push schema changes (dev only)
npm run db:seed          # Run seed script
npm run db:studio        # Open Prisma Studio GUI
```

## Guidelines

1. **Feature modules** go in `src/modules/` - each is self-contained
2. **Shared modules** go in `src/shared/` - PrismaModule is already global
3. **Always validate input** with DTOs and class-validator decorators
4. **Services contain business logic** - controllers only handle HTTP
5. **Use NestJS exceptions** - NotFoundException, BadRequestException, etc.
