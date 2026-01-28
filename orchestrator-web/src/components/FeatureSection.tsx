import {
  Stack,
  Text,
  Group,
  Card,
  Collapse,
  Switch,
} from '@mantine/core';

interface FeatureSectionProps {
  label: string;
  description: string;
  icon: React.ReactNode;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  children: React.ReactNode;
}

export function FeatureSection({ label, description, icon, enabled, onToggle, children }: FeatureSectionProps) {
  return (
    <Card padding={0} withBorder radius="md">
      <Group justify="space-between" p="sm" bg="gray.0" style={enabled ? { borderBottom: '1px solid var(--mantine-color-gray-2)' } : undefined}>
        <Group gap="xs">
          {icon}
          <div>
            <Text fw={500} size="sm">{label}</Text>
            <Text size="xs" c="dimmed">{description}</Text>
          </div>
        </Group>
        <Switch checked={enabled} onChange={(e) => onToggle(e.currentTarget.checked)} />
      </Group>
      <Collapse in={enabled}>
        <Stack gap="xs" p="sm">
          {children}
        </Stack>
      </Collapse>
    </Card>
  );
}
