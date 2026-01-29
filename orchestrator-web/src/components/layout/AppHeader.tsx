import {
  Group,
  ThemeIcon,
  Title,
  Badge,
  Switch,
  Tooltip,
  ActionIcon,
} from '@mantine/core';
import { IconRocket, IconSparkles, IconPower, IconHome } from '@tabler/icons-react';

interface AppHeaderProps {
  activeSessionId: string | null;
  shutdownOnClose: boolean;
  onShutdownOnCloseChange: (checked: boolean) => void;
  onBackToHome?: () => void;
}

export function AppHeader({ activeSessionId, shutdownOnClose, onShutdownOnCloseChange, onBackToHome }: AppHeaderProps) {
  return (
    <Group justify="space-between" h="100%">
      <Group gap="sm">
        {onBackToHome && (
          <Tooltip label="Back to Home">
            <ActionIcon variant="subtle" color="gray" size="lg" onClick={onBackToHome}>
              <IconHome size={20} />
            </ActionIcon>
          </Tooltip>
        )}
        <ThemeIcon size="lg" radius="md" color="peach" variant="light">
          <IconRocket size={20} />
        </ThemeIcon>
        <Title order={3} style={{ fontWeight: 700 }}>
          AIO Orchestrator
        </Title>
      </Group>
      <Group gap="md">
        {activeSessionId && (
          <Badge
            variant="light"
            color="peach"
            size="lg"
            radius="md"
            leftSection={<IconSparkles size={14} />}
          >
            Session Active
          </Badge>
        )}
        <Tooltip label="When enabled, closing this tab will also stop the server">
          <Group gap="xs">
            <IconPower size={16} style={{ color: shutdownOnClose ? 'var(--mantine-color-red-6)' : 'var(--mantine-color-gray-5)' }} />
            <Switch
              size="sm"
              checked={shutdownOnClose}
              onChange={(e) => onShutdownOnCloseChange(e.currentTarget.checked)}
              label="Stop server on close"
              styles={{ label: { fontSize: '12px', color: 'var(--mantine-color-gray-6)' } }}
            />
          </Group>
        </Tooltip>
      </Group>
    </Group>
  );
}
