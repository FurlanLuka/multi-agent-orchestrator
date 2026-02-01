import {
  Stack,
  NavLink,
  Text,
  Group,
  ActionIcon,
} from '@mantine/core';
import {
  IconFolder,
  IconLayoutGrid,
  IconArrowLeft,
} from '@tabler/icons-react';
import { useNavigate } from 'react-router-dom';

export type SettingsTab = 'projects' | 'workspaces';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  const navigate = useNavigate();

  return (
    <Stack gap="xs" p="md" w={200}>
      <Group gap="xs" mb="xs">
        <ActionIcon
          variant="subtle"
          color="gray"
          size="sm"
          onClick={() => navigate('/')}
        >
          <IconArrowLeft size={14} />
        </ActionIcon>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Settings
        </Text>
      </Group>
      <NavLink
        label="Projects"
        leftSection={<IconFolder size={16} />}
        active={activeTab === 'projects'}
        onClick={() => onTabChange('projects')}
        variant="light"
      />
      <NavLink
        label="Workspaces"
        leftSection={<IconLayoutGrid size={16} />}
        active={activeTab === 'workspaces'}
        onClick={() => onTabChange('workspaces')}
        variant="light"
      />
    </Stack>
  );
}
