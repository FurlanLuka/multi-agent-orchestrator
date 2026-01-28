import { ActionIcon, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';

interface FloatingSettingsButtonProps {
  onClick: () => void;
}

export function FloatingSettingsButton({ onClick }: FloatingSettingsButtonProps) {
  return (
    <Tooltip label="Settings" position="right">
      <ActionIcon
        variant="subtle"
        color="gray"
        size="xl"
        radius="xl"
        onClick={onClick}
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
        }}
      >
        <IconSettings size={24} />
      </ActionIcon>
    </Tooltip>
  );
}
