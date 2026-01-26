# Backend Development Skill

You are working on a NestJS backend project with TypeScript.

## Project Structure

```
src/
├── main.ts              # Entry point
├── app.module.ts        # Root module
├── app.controller.ts    # Root controller
├── app.service.ts       # Root service
└── modules/             # Feature modules (create as needed)
```

## Development Commands

- `npm run start:dev` - Start development server with watch mode (port 3000)
- `npm run build` - Build for production
- `npm run start:prod` - Run production build

## NestJS Patterns

### Creating a Module

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

### Creating a Controller

```typescript
import { Controller, Get, Post, Body, Param } from '@nestjs/common';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }
}
```

### Creating a Service

```typescript
import { Injectable } from '@nestjs/common';

@Injectable()
export class UsersService {
  private users = [];

  findAll() {
    return this.users;
  }

  findOne(id: string) {
    return this.users.find(user => user.id === id);
  }

  create(data: CreateUserDto) {
    const user = { id: Date.now().toString(), ...data };
    this.users.push(user);
    return user;
  }
}
```

## Guidelines

1. **Modules**: Group related features into modules
2. **Controllers**: Handle HTTP requests, delegate to services
3. **Services**: Contain business logic
4. **DTOs**: Define data transfer objects for validation
5. **Dependency Injection**: Let NestJS inject dependencies

## When Making Changes

1. Start the dev server if not running
2. Create/modify modules, controllers, services
3. Register new modules in app.module.ts
4. Test endpoints with curl or HTTP client
5. Check for TypeScript errors
