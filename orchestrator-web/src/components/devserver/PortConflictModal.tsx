import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  ThemeIcon,
  Badge,
} from '@mantine/core';
import { IconAlertTriangle, IconPlayerPlay, IconX } from '@tabler/icons-react';
import type { PortConflict } from '@orchy/types';
import { GlassCard } from '../../theme';

interface PortConflictModalProps {
  opened: boolean;
  conflicts: PortConflict[];
  onClose: () => void;
  onKillPort: (port: number) => void;
  onSkipConflicting: () => void;
  onKillAllAndStart: () => void;
}

/**
 * Modal showing port conflicts when starting dev servers.
 * Allows user to kill conflicting processes or skip conflicting servers.
 */
export function PortConflictModal({
  opened,
  conflicts,
  onClose,
  onKillPort,
  onSkipConflicting,
  onKillAllAndStart,
}: PortConflictModalProps) {
  const conflictingPorts = conflicts.filter(c => c.inUse);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="honey" variant="light" size="sm">
            <IconAlertTriangle size={14} />
          </ThemeIcon>
          <Text fw={600}>Port Conflicts Detected</Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Some ports required by your dev servers are already in use.
          You can kill the conflicting processes or start only the available servers.
        </Text>

        <Stack gap="xs">
          {conflictingPorts.map(conflict => (
            <GlassCard key={conflict.port} p="sm">
              <Group justify="space-between" wrap="nowrap">
                <Stack gap={4}>
                  <Group gap="xs">
                    <Text size="sm" fw={500}>
                      {conflict.project}
                    </Text>
                    <Badge size="sm" color="honey" variant="light">
                      Port {conflict.port}
                    </Badge>
                  </Group>
                  {conflict.processName && (
                    <Text size="xs" c="dimmed">
                      In use by: {conflict.processName}
                      {conflict.processPid && ` (PID ${conflict.processPid})`}
                    </Text>
                  )}
                </Stack>

                <Button
                  variant="light"
                  color="rose"
                  size="xs"
                  onClick={() => onKillPort(conflict.port)}
                  leftSection={<IconX size={14} />}
                >
                  Kill
                </Button>
              </Group>
            </GlassCard>
          ))}
        </Stack>

        <Stack gap="xs" mt="sm">
          <Button
            variant="light"
            color="rose"
            fullWidth
            onClick={onKillAllAndStart}
            leftSection={<IconPlayerPlay size={16} />}
          >
            Kill All Conflicting & Start
          </Button>

          <Button
            variant="light"
            color="gray"
            fullWidth
            onClick={onSkipConflicting}
          >
            Skip Conflicting Servers
          </Button>

          <Button
            variant="subtle"
            color="gray"
            fullWidth
            onClick={onClose}
          >
            Cancel
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
}
