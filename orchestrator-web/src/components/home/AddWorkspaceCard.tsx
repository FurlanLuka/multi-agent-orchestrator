import { Text, Stack } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { GlassDashedCard } from '../../theme';

interface AddWorkspaceCardProps {
  onClick: () => void;
}

export function AddWorkspaceCard({ onClick }: AddWorkspaceCardProps) {
  return (
    <GlassDashedCard
      onClick={onClick}
      style={{
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Stack align="center" gap="xs">
        <IconPlus size={28} style={{ opacity: 0.5 }} />
        <Text size="sm" fw={500} style={{ opacity: 0.6 }}>New Workspace</Text>
      </Stack>
    </GlassDashedCard>
  );
}
