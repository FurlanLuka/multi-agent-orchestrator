import { Card, Group, Badge, Text, Stack, Button } from '@mantine/core';
import { IconClipboardCheck } from '@tabler/icons-react';
import type { Plan, PlanProposal } from '@aio/types';
import { TabbedPlanView } from './TabbedPlanView';

interface PlanReadyFlowCardProps {
  pendingPlan: PlanProposal;
  onApprovePlan: (plan: Plan) => void;
}

export function PlanReadyFlowCard({ pendingPlan, onApprovePlan }: PlanReadyFlowCardProps) {
  const { plan } = pendingPlan;
  const taskCount = plan.tasks.length;
  const projectCount = new Set(plan.tasks.map(t => t.project)).size;

  return (
    <Card
      p="sm"
      radius="md"
      withBorder
      style={{
        backgroundColor: 'var(--mantine-color-green-0)',
        borderColor: 'var(--mantine-color-green-4)',
      }}
    >
      <Stack gap="md">
        {/* Header */}
        <Group gap="sm" justify="space-between">
          <Group gap="sm">
            <IconClipboardCheck size={20} color="var(--mantine-color-green-6)" />
            <Text size="sm" fw={600} c="green.7">
              PLAN READY FOR REVIEW
            </Text>
          </Group>
          <Badge size="sm" variant="light" color="green">
            {taskCount} task{taskCount !== 1 ? 's' : ''} · {projectCount} project{projectCount !== 1 ? 's' : ''}
          </Badge>
        </Group>

        {/* Plan feature name */}
        <Text size="sm" c="dimmed">
          {plan.feature}
        </Text>

        {/* Full plan view */}
        <TabbedPlanView plan={plan} isApproval={true} />

        {/* Approve button */}
        <Group justify="flex-end">
          <Button
            variant="filled"
            color="green"
            size="sm"
            onClick={() => onApprovePlan(plan)}
          >
            Approve & Start
          </Button>
        </Group>
      </Stack>
    </Card>
  );
}
