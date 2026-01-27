import {
  Stack,
  Text,
  Group,
  Card,
  Badge,
  Checkbox,
  ActionIcon,
  Collapse,
  Switch,
  Tooltip,
  SimpleGrid,
  Accordion,
  Alert,
} from '@mantine/core';
import {
  IconChevronDown,
  IconChevronUp,
  IconAlertTriangle,
  IconShield,
  IconShieldOff,
} from '@tabler/icons-react';

// Permission types
interface PermissionOption {
  id: string;
  label: string;
  description: string;
  category: 'file' | 'bash' | 'mcp';
}

interface PermissionCategory {
  id: string;
  label: string;
  description: string;
  permissions: PermissionOption[];
}

interface PermissionGroup {
  id: string;
  label: string;
  description: string;
  permissions: string[];
}

export interface PermissionsConfig {
  categories: PermissionCategory[];
  groups: PermissionGroup[];
  templates: Record<string, string[]>;
  alwaysDenied: string[];
}

interface CollapsiblePermissionsProps {
  expanded: boolean;
  onToggle: () => void;
  dangerouslyAllowAll: boolean;
  onDangerouslyAllowAllChange: (value: boolean) => void;
  permissions: string[];
  onPermissionsChange: (permissions: string[]) => void;
  permissionsConfig: PermissionsConfig | null;
}

export function CollapsiblePermissions({
  expanded,
  onToggle,
  dangerouslyAllowAll,
  onDangerouslyAllowAllChange,
  permissions,
  onPermissionsChange,
  permissionsConfig,
}: CollapsiblePermissionsProps) {
  return (
    <Card padding="sm" withBorder radius="md">
      <Group
        justify="space-between"
        onClick={onToggle}
        style={{ cursor: 'pointer' }}
      >
        <Group gap="xs">
          <IconShield size={16} />
          <div>
            <Text fw={500} size="sm">Agent Permissions</Text>
            <Text size="xs" c="dimmed">Configure what the agent can do</Text>
          </div>
        </Group>
        <ActionIcon variant="subtle">
          {expanded ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
        </ActionIcon>
      </Group>
      <Collapse in={expanded}>
        <Stack gap="sm" pt="md">
          <Switch
            label="Dangerously Allow All"
            description="Skip all permission checks (not recommended)"
            checked={dangerouslyAllowAll}
            onChange={(e) => onDangerouslyAllowAllChange(e.currentTarget.checked)}
            color="red"
            thumbIcon={dangerouslyAllowAll ? <IconShieldOff size={12} /> : <IconShield size={12} />}
          />

          {!dangerouslyAllowAll && permissionsConfig && (
            <Accordion variant="contained" radius="sm">
              <Accordion.Item value="groups">
                <Accordion.Control icon={<IconShield size={16} />}>
                  <Text size="sm" fw={500}>Quick Toggle Groups</Text>
                </Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="xs">
                    {permissionsConfig.groups.map(group => {
                      const allEnabled = group.permissions.every(p => permissions.includes(p));
                      const someEnabled = group.permissions.some(p => permissions.includes(p));
                      return (
                        <Checkbox
                          key={group.id}
                          label={group.label}
                          description={group.description}
                          checked={allEnabled}
                          indeterminate={someEnabled && !allEnabled}
                          onChange={(e) => {
                            if (e.currentTarget.checked) {
                              onPermissionsChange([...new Set([...permissions, ...group.permissions])]);
                            } else {
                              onPermissionsChange(permissions.filter((p: string) => !group.permissions.includes(p)));
                            }
                          }}
                        />
                      );
                    })}
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              {permissionsConfig.categories.map(category => (
                <Accordion.Item key={category.id} value={category.id}>
                  <Accordion.Control>
                    <Group gap="xs">
                      <Text size="sm" fw={500}>{category.label}</Text>
                      <Badge size="xs" variant="light">
                        {category.permissions.filter(p => permissions.includes(p.id)).length}/{category.permissions.length}
                      </Badge>
                    </Group>
                  </Accordion.Control>
                  <Accordion.Panel>
                    <SimpleGrid cols={2} spacing="xs">
                      {category.permissions.map(perm => (
                        <Tooltip key={perm.id} label={perm.description} position="top-start" multiline w={250}>
                          <Checkbox
                            label={perm.label}
                            checked={permissions.includes(perm.id)}
                            onChange={(e) => {
                              if (e.currentTarget.checked) {
                                onPermissionsChange([...permissions, perm.id]);
                              } else {
                                onPermissionsChange(permissions.filter((p: string) => p !== perm.id));
                              }
                            }}
                            size="xs"
                          />
                        </Tooltip>
                      ))}
                    </SimpleGrid>
                  </Accordion.Panel>
                </Accordion.Item>
              ))}
            </Accordion>
          )}

          {dangerouslyAllowAll && (
            <Alert icon={<IconAlertTriangle size={16} />} color="red" variant="light">
              All permission checks will be skipped. The agent can execute any command without restrictions.
            </Alert>
          )}
        </Stack>
      </Collapse>
    </Card>
  );
}
