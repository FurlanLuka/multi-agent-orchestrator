import { Stack, Text, Group, ThemeIcon } from '@mantine/core';
import { IconCheck, IconLoader, IconCircle } from '@tabler/icons-react';
import type { PlanningSessionState } from '@orchy/types';
import { GlassCard } from '../../theme';

interface PlanningSidebarProps {
  planningState: PlanningSessionState;
}

const STAGE_LABELS: Record<string, string> = {
  feature_refinement: 'Feature Refinement',
  sub_feature_breakdown: 'Sub-feature Breakdown',
  sub_feature_refinement: 'Sub-feature Refinement',
  project_exploration: 'Project Exploration',
  technical_planning: 'Technical Planning',
  task_generation: 'Task Generation',
};

export function PlanningSidebar({ planningState }: PlanningSidebarProps) {
  return (
    <GlassCard p="md">
      <Text fw={600} size="sm" mb="md">Planning Progress</Text>
      <Stack gap="xs">
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
    </GlassCard>
  );
}
