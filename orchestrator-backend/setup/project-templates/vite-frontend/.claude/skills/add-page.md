---
name: add-page
description: Create a new page with route and components. Use when user asks to add a page, screen, view, or route.
---

# Add Page

## Steps

1. Create the page component in `src/pages/`
2. Create feature components in `src/components/<page-name>/`
3. Add route in App.tsx

## Page Component

Pages are **composition only** - no business logic:

```tsx
// src/pages/UsersPage.tsx
import { Container, Title } from '@mantine/core';
import { UsersList } from '../components/users/UsersList';
import { CreateUserButton } from '../components/users/CreateUserButton';

export function UsersPage() {
  return (
    <Container size="lg" py="xl">
      <Title order={1} mb="lg">Users</Title>
      <CreateUserButton />
      <UsersList />
    </Container>
  );
}
```

## Feature Components

Components contain the business logic:

```tsx
// src/components/users/UsersList.tsx
import { Table, Loader, Alert } from '@mantine/core';
import { useUsers } from '../../server-state/users';

export function UsersList() {
  const { data: users, isLoading, error } = useUsers();

  if (isLoading) return <Loader />;
  if (error) return <Alert color="red">Failed to load users</Alert>;

  return (
    <Table>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>Name</Table.Th>
          <Table.Th>Email</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {users?.map((user) => (
          <Table.Tr key={user.id}>
            <Table.Td>{user.name}</Table.Td>
            <Table.Td>{user.email}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

```tsx
// src/components/users/CreateUserButton.tsx
import { Button } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { CreateUserModal } from './CreateUserModal';

export function CreateUserButton() {
  const [opened, { open, close }] = useDisclosure(false);

  return (
    <>
      <Button onClick={open} mb="md">Add User</Button>
      <CreateUserModal opened={opened} onClose={close} />
    </>
  );
}
```

## Add Route

```tsx
// src/App.tsx
import { Routes, Route } from 'react-router-dom';
import { UsersPage } from './pages/UsersPage';

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/users" element={<UsersPage />} />
    </Routes>
  );
}
```

## File Structure

```
src/
├── pages/
│   └── UsersPage.tsx           # Composition only
└── components/
    └── users/
        ├── UsersList.tsx       # Data display
        ├── CreateUserButton.tsx
        └── CreateUserModal.tsx # Form logic
```
