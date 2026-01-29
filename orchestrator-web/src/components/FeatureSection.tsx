import {
  Stack,
  Text,
  Group,
  Collapse,
} from '@mantine/core';
import { GlassSurface, GlassSwitch } from '../theme';

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
    <GlassSurface style={{ overflow: 'hidden', padding: 0 }}>
      <Group
        justify="space-between"
        p="sm"
        style={enabled ? {
          background: 'rgba(160, 130, 110, 0.04)',
          borderBottom: '1px solid rgba(160, 130, 110, 0.06)',
        } : {
          background: 'rgba(160, 130, 110, 0.02)',
        }}
      >
        <Group gap="xs">
          {icon}
          <div>
            <Text fw={500} size="sm">{label}</Text>
            <Text size="xs" c="dimmed">{description}</Text>
          </div>
        </Group>
        <GlassSwitch checked={enabled} onChange={(e) => onToggle(e.currentTarget.checked)} />
      </Group>
      <Collapse in={enabled}>
        <Stack gap="xs" p="sm" style={{ background: 'rgba(255, 255, 255, 0.5)' }}>
          {children}
        </Stack>
      </Collapse>
    </GlassSurface>
  );
}
