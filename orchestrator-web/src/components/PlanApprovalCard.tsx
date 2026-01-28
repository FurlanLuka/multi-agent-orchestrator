import { Card, Group, Badge, Text, Stack, Button } from '@mantine/core';
import { IconClipboardCheck, IconMessage } from '@tabler/icons-react';
import type { Plan } from '@aio/types';
import { TabbedPlanView } from './TabbedPlanView';

interface PlanApprovalCardProps {
  plan: Plan;
  onApprove: () => void;
}

export function PlanApprovalCard({ plan, onApprove }: PlanApprovalCardProps) {
  const tasks = plan?.tasks || [];
  const taskCount = tasks.length;
  const projectCount = new Set(tasks.map(t => t.project)).size;

  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-blue-0)',
        borderColor: 'var(--mantine-color-blue-4)',
      }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconClipboardCheck size={20} color="var(--mantine-color-blue-6)" />
            <Text size="sm" fw={600} c="blue.7">
              PLAN READY FOR APPROVAL
            </Text>
          </Group>
          <Badge size="sm" variant="light" color="blue">
            {taskCount} task{taskCount !== 1 ? 's' : ''} · {projectCount} project{projectCount !== 1 ? 's' : ''}
          </Badge>
        </Group>

        {/* Plan feature name */}
        <Text size="sm" c="dimmed">
          {plan.feature}
        </Text>

        {/* Full plan view */}
        <TabbedPlanView plan={plan} isApproval={true} />

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
            color="blue"
            size="sm"
            onClick={onApprove}
          >
            Approve & Start
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
