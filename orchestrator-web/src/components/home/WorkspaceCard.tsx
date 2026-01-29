import { Text } from '@mantine/core';
import type { WorkspaceConfig } from '@aio/types';
import { GlassCard } from '../../theme';

interface WorkspaceCardProps {
  workspace: WorkspaceConfig;
  onClick: () => void;
}

export function WorkspaceCard({ workspace, onClick }: WorkspaceCardProps) {
  return (
    <GlassCard
      hoverable
      onClick={onClick}
      p="lg"
      style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <Text fw={600} size="lg" ta="center">{workspace.name}</Text>
    </GlassCard>
  );
}
