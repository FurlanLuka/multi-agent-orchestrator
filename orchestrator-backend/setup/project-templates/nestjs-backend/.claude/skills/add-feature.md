---
name: add-feature
description: Create a new feature module with controller, service, and DTOs. Use when user asks to add a new feature, endpoint, resource, or API route.
---

# Add Feature Module

## Steps

1. Create directory structure:
```bash
mkdir -p src/modules/<feature>/dto
```

2. Create files in this order:
   - DTOs (define validation first)
   - Service (business logic)
   - Controller (HTTP layer)
   - Module (wire everything)

3. Register in `app.module.ts`

## DTO Examples

```typescript
// src/modules/posts/dto/create-post.dto.ts
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class CreatePostDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsOptional()
  content?: string;
}
```

```typescript
// src/modules/posts/dto/update-post.dto.ts
import { PartialType } from '@nestjs/common';
import { CreatePostDto } from './create-post.dto';

export class UpdatePostDto extends PartialType(CreatePostDto) {}
```

## Service Example

```typescript
// src/modules/posts/posts.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreatePostDto) {
    return this.prisma.post.create({ data: dto });
  }

  findAll() {
    return this.prisma.post.findMany();
  }

  async findOne(id: string) {
    const post = await this.prisma.post.findUnique({ where: { id } });
    if (!post) throw new NotFoundException(`Post ${id} not found`);
    return post;
  }

  async update(id: string, dto: UpdatePostDto) {
    await this.findOne(id);
    return this.prisma.post.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.post.delete({ where: { id } });
  }
}
```

## Controller Example

```typescript
// src/modules/posts/posts.controller.ts
import { Controller, Get, Post, Put, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { PostsService } from './posts.service';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';

@Controller('posts')
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Post()
  create(@Body() dto: CreatePostDto) {
    return this.postsService.create(dto);
  }

  @Get()
  findAll() {
    return this.postsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.postsService.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: UpdatePostDto) {
    return this.postsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.postsService.remove(id);
  }
}
```

## Module Example

```typescript
// src/modules/posts/posts.module.ts
import { Module } from '@nestjs/common';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

@Module({
  controllers: [PostsController],
  providers: [PostsService],
  exports: [PostsService],
})
export class PostsModule {}
```

## Register Module

```typescript
// src/app.module.ts
import { PostsModule } from './modules/posts/posts.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    PostsModule, // Add here
  ],
  // ...
})
export class AppModule {}
```
