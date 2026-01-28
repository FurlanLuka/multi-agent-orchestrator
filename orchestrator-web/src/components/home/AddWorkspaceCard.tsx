import {
  Card,
  Text,
  Stack,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';

interface AddWorkspaceCardProps {
  onClick: () => void;
}

export function AddWorkspaceCard({ onClick }: AddWorkspaceCardProps) {
  return (
    <Card
      shadow="sm"
      radius="md"
      p="lg"
      style={{
        cursor: 'pointer',
        border: '2px dashed var(--mantine-color-gray-4)',
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={onClick}
    >
      <Stack align="center" gap="xs">
        <IconPlus size={32} color="var(--mantine-color-gray-5)" />
        <Text size="sm" c="dimmed" fw={500}>New Workspace</Text>
      </Stack>
    </Card>
  );
}
