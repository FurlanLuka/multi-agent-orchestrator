import { Stack, Text, Group, ThemeIcon, Box, Badge } from '@mantine/core';
import { IconCheck, IconLoader, IconCircle, IconListCheck } from '@tabler/icons-react';
import type { PlanningSessionState } from '@orchy/types';
import { glass, radii } from '../../theme';

interface PlanningSidebarProps {
  planningState: PlanningSessionState;
}

const STAGE_LABELS: Record<string, string> = {
  feature_refinement: 'Feature Refinement',
  exploration_planning: 'Exploration & Planning',
  task_generation: 'Task Generation',
};

export function PlanningSidebar({ planningState }: PlanningSidebarProps) {
  const completedCount = planningState.stages.filter(s => s.status === 'completed').length;
  const totalCount = planningState.stages.length;

  return (
    <Box
      style={{
        height: '100%',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: radii.surface,
        background: glass.formCard.bg,
        border: glass.formCard.border,
        boxShadow: glass.formCard.shadow,
      }}
    >
      {/* Header */}
      <Group
        justify="space-between"
        px="lg"
        py="md"
        style={{
          background: glass.modalZone.bg,
          borderBottom: glass.modalZone.border,
          flexShrink: 0,
        }}
      >
        <Group gap="xs">
          <IconListCheck size={16} style={{ color: 'var(--text-heading)' }} />
          <Text fw={600} size="sm" style={{ color: 'var(--text-heading)' }}>
            Planning Progress
          </Text>
        </Group>
        <Badge
          color={completedCount === totalCount ? 'sage' : 'peach'}
          variant="light"
          size="sm"
          radius="md"
        >
          {completedCount}/{totalCount}
        </Badge>
      </Group>

      {/* Content */}
      <Box p="md" style={{ flex: 1, overflow: 'auto' }}>
        <Stack gap="sm">
          {planningState.stages.map((stage) => (
            <Group key={stage.stage} gap="sm">
              <ThemeIcon
                size="sm"
                variant="light"
                color={stage.status === 'completed' ? 'sage' : stage.status === 'active' || stage.status === 'awaiting_approval' ? 'peach' : 'gray'}
              >
                {stage.status === 'completed' ? <IconCheck size={12} /> :
                 stage.status === 'active' || stage.status === 'awaiting_approval' ? <IconLoader size={12} /> :
                 <IconCircle size={12} />}
              </ThemeIcon>
              <Text size="sm" c={stage.status === 'pending' ? 'dimmed' : undefined}>
                {STAGE_LABELS[stage.stage]}
              </Text>
            </Group>
          ))}
        </Stack>
      </Box>
    </Box>
  );
}
