import {
  Stack,
  NavLink,
  Text,
} from '@mantine/core';
import {
  IconFolder,
  IconLayoutGrid,
} from '@tabler/icons-react';

export type SettingsTab = 'projects' | 'workspaces';

interface SettingsSidebarProps {
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
}

export function SettingsSidebar({ activeTab, onTabChange }: SettingsSidebarProps) {
  return (
    <Stack gap="xs" p="md" w={200}>
      <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
        Settings
      </Text>
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
