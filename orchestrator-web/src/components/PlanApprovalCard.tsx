import { Group, Badge, Text, Stack, Button, ScrollArea } from '@mantine/core';
import { IconClipboardList, IconMessage } from '@tabler/icons-react';
import type { Plan } from '@orchy/types';
import { TabbedPlanView } from './TabbedPlanView';
import { GlassCard } from '../theme';

interface PlanApprovalCardProps {
  plan: Plan;
  onApprove: () => void;
}

export function PlanApprovalCard({ plan, onApprove }: PlanApprovalCardProps) {
  const tasks = plan?.tasks || [];
  const taskCount = tasks.length;
  const projectCount = new Set(tasks.map(t => t.project)).size;

  return (
    <GlassCard
      p="sm"
      style={{
        backgroundColor: 'rgba(160, 130, 110, 0.06)',
        borderColor: 'rgba(160, 130, 110, 0.15)',
      }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconClipboardList size={20} style={{ color: 'var(--text-heading)' }} />
            <Text size="sm" fw={600} style={{ color: 'var(--text-heading)' }}>
              Plan Ready for Review
            </Text>
          </Group>
          <Badge size="sm" variant="light" color="gray">
            {taskCount} task{taskCount !== 1 ? 's' : ''} · {projectCount} project{projectCount !== 1 ? 's' : ''}
          </Badge>
        </Group>

        {/* Plan feature name */}
        <Text size="sm" c="dimmed">
          {plan.feature}
        </Text>

        {/* Full plan view - scrollable to prevent overflow */}
        <ScrollArea.Autosize mah={400} offsetScrollbars>
          <TabbedPlanView plan={plan} isApproval={true} />
        </ScrollArea.Autosize>

        {/* Feedback hint */}
        <Group gap="xs" c="dimmed">
          <IconMessage size={16} />
          <Text size="xs">
            Type feedback below to request changes, or approve to start execution
          </Text>
        </Group>

        {/* Approve button */}
        <Group justify="flex-end">
          <Button
            variant="filled"
            color="peach"
            size="sm"
            onClick={onApprove}
          >
            Approve & Start
          </Button>
        </Group>
      </Stack>
    </GlassCard>
  );
}
