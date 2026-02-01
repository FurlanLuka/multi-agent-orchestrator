---
name: prisma-migrations
description: Add database models, create migrations, and seed data. Use when user asks to add a model, create a table, modify schema, or seed the database.
---

# Prisma Migrations

Schema location: `prisma/schema.prisma`
Config location: `prisma.config.ts`

## Prisma 7 Configuration

Database URL is configured in `prisma.config.ts`:

```typescript
import { defineConfig } from 'prisma/config';

export default defineConfig({
    schema: 'prisma/schema.prisma',
    datasource: {
        url: process.env.DATABASE_URL || 'file:./dev.db',
    },
});
```

## Add a New Model

1. Edit `prisma/schema.prisma`:

```prisma
model Post {
    id        String   @id @default(cuid())
    title     String
    content   String?
    published Boolean  @default(false)
    createdAt DateTime @default(now())
    updatedAt DateTime @updatedAt

    author    User     @relation(fields: [authorId], references: [id])
    authorId  String
}
```

2. Run migration:
```bash
npm run db:migrate
# Enter name when prompted, e.g., "add_posts"
```

3. Prisma Client is auto-regenerated.

## Common Field Types

```prisma
# Strings
name      String              # Required
name      String?             # Optional
email     String   @unique    # Unique constraint

# Numbers
count     Int
count     Int      @default(0)
price     Float
price     Decimal

# Boolean
active    Boolean  @default(true)

# Dates
createdAt DateTime @default(now())
updatedAt DateTime @updatedAt

# IDs
id        String   @id @default(cuid())   # CUID
id        String   @id @default(uuid())   # UUID
id        Int      @id @default(autoincrement())  # Auto-increment
```

## Relations

### One-to-Many

```prisma
model User {
    id    String @id @default(cuid())
    posts Post[]
}

model Post {
    id       String @id @default(cuid())
    author   User   @relation(fields: [authorId], references: [id])
    authorId String
}
```

### Many-to-Many

```prisma
model Post {
    id   String @id @default(cuid())
    tags Tag[]
}

model Tag {
    id    String @id @default(cuid())
    posts Post[]
}
```

### One-to-One

```prisma
model User {
    id      String   @id @default(cuid())
    profile Profile?
}

model Profile {
    id     String @id @default(cuid())
    user   User   @relation(fields: [userId], references: [id])
    userId String @unique
}
```

## Seeding

Edit `prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const user = await prisma.user.upsert({
        where: { email: 'admin@example.com' },
        update: {},
        create: {
            email: 'admin@example.com',
            name: 'Admin',
        },
    });
    console.log('Created:', user);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
```

Run seed:
```bash
npm run db:seed
```

## Commands Reference

```bash
npm run db:migrate      # Create and apply migration
npm run db:push         # Push schema (no migration file, dev only)
npm run db:seed         # Run seed script
npm run db:studio       # Open Prisma Studio
npm run db:generate     # Regenerate Prisma Client
```
