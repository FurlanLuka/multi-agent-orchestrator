---
name: server-state
description: React Query hooks for API data fetching and mutations. Use when user asks to fetch data, call API, create hooks for backend, or manage server state.
---

# Server State with React Query

All API data uses React Query. Never use useState for server data.

## Setup API Client

```typescript
// src/server-state/apiClient.ts
import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000',
  headers: {
    'Content-Type': 'application/json',
  },
});
```

## Query Keys Factory

```typescript
// src/server-state/queryKeys.ts
export const queryKeys = {
  users: {
    all: ['users'] as const,
    detail: (id: string) => ['users', id] as const,
  },
  posts: {
    all: ['posts'] as const,
    detail: (id: string) => ['posts', id] as const,
    byUser: (userId: string) => ['posts', 'user', userId] as const,
  },
};
```

## Feature Hooks

```typescript
// src/server-state/users.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from './apiClient';
import { queryKeys } from './queryKeys';

// Types
export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface CreateUserDto {
  email: string;
  name?: string;
}

// Queries
export function useUsers() {
  return useQuery({
    queryKey: queryKeys.users.all,
    queryFn: async () => {
      const { data } = await apiClient.get<User[]>('/users');
      return data;
    },
  });
}

export function useUser(id: string) {
  return useQuery({
    queryKey: queryKeys.users.detail(id),
    queryFn: async () => {
      const { data } = await apiClient.get<User>(`/users/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

// Mutations
export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dto: CreateUserDto) => {
      const { data } = await apiClient.post<User>('/users', dto);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...dto }: { id: string } & Partial<CreateUserDto>) => {
      const { data } = await apiClient.put<User>(`/users/${id}`, dto);
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.users.detail(id) });
    },
  });
}

export function useDeleteUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      await apiClient.delete(`/users/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all });
    },
  });
}
```

## Usage in Components

```tsx
import { useUsers, useCreateUser } from '../server-state/users';

function UsersList() {
  const { data: users, isLoading, error } = useUsers();
  const createUser = useCreateUser();

  const handleCreate = () => {
    createUser.mutate({ email: 'new@example.com', name: 'New User' });
  };

  if (isLoading) return <Loader />;
  if (error) return <Alert color="red">Error loading users</Alert>;

  return (
    <>
      <Button onClick={handleCreate} loading={createUser.isPending}>
        Add User
      </Button>
      {users?.map(user => <div key={user.id}>{user.name}</div>)}
    </>
  );
}
```

## Naming Convention

- `useXxx` - fetch single or list
- `useCreateXxx` - create mutation
- `useUpdateXxx` - update mutation
- `useDeleteXxx` - delete mutation
