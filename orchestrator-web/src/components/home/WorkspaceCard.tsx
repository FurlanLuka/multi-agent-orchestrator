import { Text, ActionIcon, Stack, Group, Badge, Tooltip } from '@mantine/core';
import { IconTrash, IconFolder, IconGitMerge } from '@tabler/icons-react';
import type { WorkspaceConfig } from '@orchy/types';
import { GlassCard } from '../../theme';

interface WorkspaceCardProps {
  workspace: WorkspaceConfig;
  onClick: () => void;
  onDelete?: (e: React.MouseEvent) => void;
}

export function WorkspaceCard({ workspace, onClick, onDelete }: WorkspaceCardProps) {
  const projectCount = workspace.projects.length;

  return (
    <GlassCard
      hoverable
      onClick={onClick}
      p="lg"
      style={{
        minHeight: 160,
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Delete button */}
      {onDelete && (
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          style={{ position: 'absolute', top: 8, right: 8 }}
          onClick={onDelete}
        >
          <IconTrash size={14} />
        </ActionIcon>
      )}

      {/* Content */}
      <Stack gap="sm" style={{ flex: 1 }}>
        <Stack gap={4}>
          <Text fw={600} size="md">{workspace.name}</Text>
          {workspace.context && (
            <Text size="xs" c="dimmed" lineClamp={2}>{workspace.context}</Text>
          )}
        </Stack>

        <Group gap="xs" mt="auto">
          {workspace.orchyManaged && (
            <Tooltip
              label="All projects share a single git repository for simplified version control"
              multiline
              w={220}
              position="bottom"
              withArrow
            >
              <Badge size="xs" variant="light" color="lavender" leftSection={<IconGitMerge size={10} />}>
                Orchy Managed
              </Badge>
            </Tooltip>
          )}
          {projectCount > 0 && (
            <Badge size="xs" variant="light" color="peach" leftSection={<IconFolder size={10} />}>
              {projectCount} {projectCount === 1 ? 'project' : 'projects'}
            </Badge>
          )}
        </Group>
      </Stack>
    </GlassCard>
  );
}
