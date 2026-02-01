import { Text, ActionIcon, Box } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@orchy/types';
import { GlassCard } from '../../theme';

interface WorkspaceCardProps {
  workspace: WorkspaceConfig;
  isEditMode?: boolean;
  onClick: () => void;
  onDelete?: () => void;
}

export function WorkspaceCard({ workspace, isEditMode, onClick, onDelete }: WorkspaceCardProps) {
  return (
    <GlassCard
      hoverable={!isEditMode}
      onClick={isEditMode ? undefined : onClick}
      p="lg"
      style={{
        aspectRatio: '1',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        cursor: isEditMode ? 'default' : 'pointer',
      }}
    >
      {isEditMode && onDelete && (
        <Box style={{ position: 'absolute', top: 8, right: 8 }}>
          <ActionIcon
            variant="light"
            color="rose"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Box>
      )}
      <Text fw={600} size="lg" ta="center">{workspace.name}</Text>
    </GlassCard>
  );
}
