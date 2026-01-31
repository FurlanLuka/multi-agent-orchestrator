import {
  Stack,
  Text,
  Group,
  ActionIcon,
  Collapse,
  SimpleGrid,
  Box,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconShield,
  IconCheck,
} from '@tabler/icons-react';
import { GlassSurface } from '../theme';

// Permission types
interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

export interface PermissionsConfig {
  categories: Array<{
    id: string;
    label: string;
    description: string;
    permissions: Array<{ id: string; label: string; description: string; category: string }>;
  }>;
  groups: PermissionGroup[];
  templates: Record<string, string[]>;
  alwaysDenied: string[];
}

interface CollapsiblePermissionsProps {
  expanded: boolean;
  onToggle: () => void;
  permissions: string[];
  onPermissionsChange: (permissions: string[]) => void;
  permissionsConfig: PermissionsConfig | null;
  disabled?: boolean;
}

interface PermissionCardProps {
  label: string;
  description: string;
  selected: boolean;
  partial?: boolean;
  onClick: () => void;
}

function PermissionCard({ label, description, selected, partial, onClick }: PermissionCardProps) {
  return (
    <Box
      onClick={onClick}
      style={{
        padding: '12px',
        borderRadius: 12,
        background: selected
          ? 'rgba(245, 133, 101, 0.12)'
          : partial
            ? 'rgba(245, 133, 101, 0.06)'
            : 'rgba(255, 255, 255, 0.6)',
        border: selected
          ? '1.5px solid rgba(245, 133, 101, 0.4)'
          : partial
            ? '1.5px solid rgba(245, 133, 101, 0.2)'
            : '1.5px solid var(--border-subtle)',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        position: 'relative',
      }}
    >
      {selected && (
        <Box
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: 'var(--color-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <IconCheck size={12} color="white" />
        </Box>
      )}
      <Text fw={500} size="sm" mb={2}>{label}</Text>
      <Text size="xs" c="dimmed" lineClamp={2}>{description}</Text>
    </Box>
  );
}

export function CollapsiblePermissions({
  expanded,
  onToggle,
  permissions,
  onPermissionsChange,
  permissionsConfig,
  disabled = false,
}: CollapsiblePermissionsProps) {
  const toggleGroup = (group: PermissionGroup) => {
    if (disabled) return;
    const allEnabled = group.permissions.every(p => permissions.includes(p));
    if (allEnabled) {
      // Remove all permissions in this group
      onPermissionsChange(permissions.filter(p => !group.permissions.includes(p)));
    } else {
      // Add all permissions in this group
      onPermissionsChange([...new Set([...permissions, ...group.permissions])]);
    }
  };

  if (!permissionsConfig) return null;

  return (
    <GlassSurface style={{ padding: 0, opacity: disabled ? 0.5 : 1, pointerEvents: disabled ? 'none' : 'auto' }}>
      <Group
        justify="space-between"
        onClick={disabled ? undefined : onToggle}
        p="sm"
        style={{
          cursor: disabled ? 'not-allowed' : 'pointer',
          background: 'rgba(160, 130, 110, 0.02)',
        }}
      >
        <Group gap="xs">
          <IconShield size={16} style={{ color: 'var(--text-muted)' }} />
          <div>
            <Text fw={500} size="sm">Agent Permissions</Text>
            <Text size="xs" c="dimmed">Configure what the agent can do</Text>
          </div>
        </Group>
        <ActionIcon variant="subtle" color="gray">
          {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>

      <Collapse in={expanded}>
        <Stack gap="md" p="sm" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
          <Text size="xs" c="dimmed" fw={500}>Quick Permission Groups</Text>
          <SimpleGrid cols={2} spacing="sm">
            {permissionsConfig.groups.map(group => {
              const allEnabled = group.permissions.every(p => permissions.includes(p));
              const someEnabled = group.permissions.some(p => permissions.includes(p));
              return (
                <PermissionCard
                  key={group.id}
                  label={group.label}
                  description={group.description}
                  selected={allEnabled}
                  partial={someEnabled && !allEnabled}
                  onClick={() => toggleGroup(group)}
                />
              );
            })}
          </SimpleGrid>
        </Stack>
      </Collapse>
    </GlassSurface>
  );
}
