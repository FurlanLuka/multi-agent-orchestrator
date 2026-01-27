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
    <Card padding="sm" withBorder radius="md" bg={enabled ? undefined : 'gray.0'}>
      <Group justify="space-between" mb={enabled ? 'sm' : 0}>
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
        <Stack gap="xs" pt="xs">
          {children}
        </Stack>
      </Collapse>
    </Card>
  );
}
