import { ActionIcon, Tooltip } from '@mantine/core';
import { IconSettings } from '@tabler/icons-react';
import { glass } from '../../theme';

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
          background: glass.bar.bg,
          backdropFilter: glass.bar.blur,
          WebkitBackdropFilter: glass.bar.blur,
          border: glass.bar.border,
          boxShadow: glass.bar.shadow,
        }}
      >
        <IconSettings size={22} />
      </ActionIcon>
    </Tooltip>
  );
}
