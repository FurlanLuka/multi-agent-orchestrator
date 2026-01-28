import {
  Card,
  Text,
} from '@mantine/core';
import type { WorkspaceConfig } from '@aio/types';

interface WorkspaceCardProps {
  workspace: WorkspaceConfig;
  onClick: () => void;
}

export function WorkspaceCard({ workspace, onClick }: WorkspaceCardProps) {
  return (
    <Card
      shadow="sm"
      radius="md"
      p="lg"
      withBorder
      style={{ cursor: 'pointer', aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClick}
    >
      <Text fw={600} size="lg" ta="center">{workspace.name}</Text>
    </Card>
  );
}
