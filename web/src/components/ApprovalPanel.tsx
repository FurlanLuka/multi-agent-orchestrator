import { Modal, Text, Button, Group, Stack, Badge, Paper } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ApprovalRequest } from '../types';

interface ApprovalPanelProps {
  approval: ApprovalRequest | null;
  onRespond: (id: string, approved: boolean) => void;
}

export function ApprovalPanel({ approval, onRespond }: ApprovalPanelProps) {
  if (!approval) return null;

  return (
    <Modal
      opened={!!approval}
      onClose={() => {}} // Don't allow closing without responding
      title={
        <Group gap="xs">
          <IconAlertCircle size={20} color="orange" />
          <Text fw={600}>Approval Required</Text>
        </Group>
      }
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      centered
    >
      <Stack gap="md">
        <Group gap="xs">
          <Badge color="blue">{approval.project}</Badge>
          <Badge color="gray">{approval.approval_type}</Badge>
        </Group>

        <Paper p="md" bg="gray.0" withBorder>
          <Text style={{ whiteSpace: 'pre-wrap' }}>{approval.prompt}</Text>
        </Paper>

        <Group justify="flex-end">
          <Button
            variant="light"
            color="red"
            onClick={() => onRespond(approval.id, false)}
          >
            Reject
          </Button>
          <Button
            color="green"
            onClick={() => onRespond(approval.id, true)}
          >
            Approve
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
