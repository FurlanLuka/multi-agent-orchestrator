import { Modal, Text, Button, Group, Stack, Badge } from '@mantine/core';
import { IconAlertCircle } from '@tabler/icons-react';
import type { ApprovalRequest } from '@aio/types';
import { GlassSurface } from '../theme';

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
          <IconAlertCircle size={20} style={{ color: 'var(--color-warning)' }} />
          <Text fw={600} style={{ color: 'var(--text-heading)' }}>Approval Required</Text>
        </Group>
      }
      closeOnClickOutside={false}
      closeOnEscape={false}
      withCloseButton={false}
      centered
      radius="lg"
      styles={{
        content: {
          background: 'rgba(255, 255, 255, 0.98)',
          backdropFilter: 'blur(24px)',
        },
      }}
    >
      <Stack gap="md">
        <Group gap="xs">
          <Badge color="peach">{approval.project}</Badge>
          <Badge color="gray">{approval.approval_type}</Badge>
        </Group>

        <GlassSurface p="md">
          <Text style={{ whiteSpace: 'pre-wrap', color: 'var(--text-body)' }}>{approval.prompt}</Text>
        </GlassSurface>

        <Group justify="flex-end">
          <Button
            variant="light"
            color="rose"
            onClick={() => onRespond(approval.id, false)}
          >
            Reject
          </Button>
          <Button
            color="sage"
            onClick={() => onRespond(approval.id, true)}
          >
            Approve
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
