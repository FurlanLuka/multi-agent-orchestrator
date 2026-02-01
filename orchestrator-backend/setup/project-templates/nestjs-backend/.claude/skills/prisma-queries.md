---
name: prisma-queries
description: Database CRUD operations, filtering, relations, and transactions. Use when user asks how to query data, create records, update, delete, or work with relations.
---

# Prisma Queries

## Setup

Inject `PrismaService` in any service:

```typescript
import { PrismaService } from '../shared/prisma/prisma.service';

constructor(private prisma: PrismaService) {}
```

## Importing Types

Use the `@database` alias for Prisma types:

```typescript
import { User, Post, Prisma } from '@database';

// Type for create input
type CreateUserInput = Prisma.UserCreateInput;

// Type for query result
async findUser(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
}
```

## Create

```typescript
// Simple
const user = await this.prisma.user.create({
  data: { email: 'user@example.com', name: 'John' },
});

// With relation (connect existing)
const post = await this.prisma.post.create({
  data: {
    title: 'Hello',
    author: { connect: { id: userId } },
  },
  include: { author: true },
});

// With nested create
const user = await this.prisma.user.create({
  data: {
    email: 'writer@example.com',
    posts: {
      create: { title: 'First Post' },
    },
  },
  include: { posts: true },
});
```

## Read

```typescript
// Find many
const users = await this.prisma.user.findMany();

// With filter and order
const posts = await this.prisma.post.findMany({
  where: { published: true },
  orderBy: { createdAt: 'desc' },
});

// Find unique
const user = await this.prisma.user.findUnique({
  where: { id: userId },
});

// Find unique or throw
const user = await this.prisma.user.findUniqueOrThrow({
  where: { id: userId },
});

// Include relations
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  include: { posts: true },
});

// Select specific fields
const user = await this.prisma.user.findUnique({
  where: { id: userId },
  select: { email: true, name: true },
});

// Pagination
const posts = await this.prisma.post.findMany({
  skip: 10,
  take: 10,
  orderBy: { createdAt: 'desc' },
});
```

## Update

```typescript
// Update one
const user = await this.prisma.user.update({
  where: { id: userId },
  data: { name: 'New Name' },
});

// Update many
const result = await this.prisma.post.updateMany({
  where: { authorId: userId },
  data: { published: true },
});

// Upsert
const user = await this.prisma.user.upsert({
  where: { email: 'user@example.com' },
  update: { name: 'Updated' },
  create: { email: 'user@example.com', name: 'New' },
});
```

## Delete

```typescript
// Delete one
await this.prisma.user.delete({ where: { id: userId } });

// Delete many
await this.prisma.post.deleteMany({ where: { published: false } });
```

## Filtering

```typescript
// AND (implicit)
const posts = await this.prisma.post.findMany({
  where: { published: true, authorId: userId },
});

// OR
const posts = await this.prisma.post.findMany({
  where: {
    OR: [
      { title: { contains: 'prisma' } },
      { content: { contains: 'prisma' } },
    ],
  },
});

// String filters
const users = await this.prisma.user.findMany({
  where: {
    email: { endsWith: '@example.com' },
    name: { contains: 'john', mode: 'insensitive' },
  },
});

// Relation filter
const users = await this.prisma.user.findMany({
  where: {
    posts: { some: { published: true } },
  },
});
```

## Transactions

```typescript
// Batch operations
const [user, post] = await this.prisma.$transaction([
  this.prisma.user.create({ data: { email: 'new@example.com' } }),
  this.prisma.post.create({ data: { title: 'Post', authorId: '...' } }),
]);

// Interactive transaction
const result = await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('User not found');

  return tx.post.create({
    data: { title: 'New Post', authorId: user.id },
  });
});
```

## Aggregations

```typescript
// Count
const count = await this.prisma.user.count();
const published = await this.prisma.post.count({ where: { published: true } });

// Group by
const byAuthor = await this.prisma.post.groupBy({
  by: ['authorId'],
  _count: true,
});
```
