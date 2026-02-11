import {
  Box,
  Stack,
  Group,
  Text,
  Button,
} from '@mantine/core';
import { IconShield, IconCheck, IconShieldCheck } from '@tabler/icons-react';

interface PermissionOverlayProps {
  toolName: string;
  toolInput: Record<string, unknown>;
  onResponse: (approved: boolean, allowAll?: boolean) => void;
  title?: string;
  compact?: boolean;
}

export function PermissionOverlay({
  toolName,
  toolInput,
  onResponse,
  title = 'Permission Required',
  compact = false,
}: PermissionOverlayProps) {
  const input = toolInput || {};

  // Get command from toolInput.command or parse from toolName
  const toolMatch = toolName.match(/^(\w+)\((.+)\)$/);
  const toolNameCommand = toolMatch ? toolMatch[2] : '';

  // Prefer toolInput.command over parsed toolName
  const actualCommand = typeof input.command === 'string' ? input.command : toolNameCommand;
  const description = typeof input.description === 'string' ? input.description : null;

  // Extract base command for "Allow All"
  const toolTypeMatch = toolName.match(/^(\w+)/);
  const toolType = toolTypeMatch ? toolTypeMatch[1] : 'Bash';
  const baseCommand = actualCommand.trim().split(/\s+/)[0] || '';
  const isValidCommand = baseCommand.length > 0 && /^[a-zA-Z][\w.-]*$/.test(baseCommand);
  const allowAllPattern = isValidCommand ? `${toolType}(${baseCommand} *)` : null;

  const iconSize = compact ? 18 : 24;
  const titleSize = compact ? 'sm' : 'md';
  const textSize = compact ? 'xs' : 'sm';
  const buttonSize = compact ? 'xs' : 'sm';
  const stackGap = compact ? 'xs' : 'md';
  const buttonGap = compact ? 'xs' : 'sm';

  return (
    <Box
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.94)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        ...(compact ? { borderRadius: 'inherit', padding: '12px' } : {}),
      }}
    >
      <Stack
        align="center"
        gap={stackGap}
        {...(compact
          ? { style: { maxWidth: '100%', width: '100%' } }
          : { p: 'xl', style: { maxWidth: 400 } }
        )}
      >
        <Group gap="xs">
          <IconShield size={iconSize} color="var(--mantine-color-blue-4)" />
          <Text fw={600} size={titleSize} c="white">{title}</Text>
        </Group>

        {/* Description */}
        {description && (
          <Text size={textSize} c="gray.4" ta="center" {...(compact ? { lineClamp: 2 } : {})}>
            {description}
          </Text>
        )}

        {/* Command display */}
        <Box
          style={{
            width: '100%',
            maxHeight: compact ? undefined : 200,
            overflow: compact ? undefined : 'auto',
            padding: compact ? '6px 10px' : '10px 14px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: compact ? '4px' : '6px',
          }}
        >
          <Text
            size={textSize}
            c="white"
            ff="monospace"
            ta="left"
            {...(compact ? { lineClamp: 3 } : {})}
            style={{
              wordBreak: 'break-all',
              whiteSpace: 'pre-wrap',
            }}
          >
            {actualCommand || toolName}
          </Text>
        </Box>

        {/* Action buttons */}
        <Group justify="center" gap={buttonGap} {...(compact ? { mt: 'xs' } : {})}>
          <Button
            color="blue"
            variant="filled"
            size={buttonSize}
            leftSection={<IconCheck size={compact ? 14 : 16} />}
            onClick={() => onResponse(true, false)}
          >
            Allow
          </Button>
          {allowAllPattern && (
            <Button
              color="teal"
              variant="light"
              size={buttonSize}
              leftSection={<IconShieldCheck size={compact ? 14 : 16} />}
              onClick={() => onResponse(true, true)}
            >
              Allow all - {allowAllPattern}
            </Button>
          )}
          <Button
            color="red"
            variant="subtle"
            size={buttonSize}
            onClick={() => onResponse(false)}
          >
            Deny
          </Button>
        </Group>
      </Stack>
    </Box>
  );
}
