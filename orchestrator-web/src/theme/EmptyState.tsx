import { Stack, Text, type MantineColor } from '@mantine/core';
import { GlassCard } from './GlassCard';

interface EmptyStateProps {
  icon: React.ReactNode;
  title?: string;
  description: string;
  action?: React.ReactNode;
  iconColor?: MantineColor;
}

/**
 * Consistent empty state display with icon, description, and optional action.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <GlassCard p="xl">
      <Stack align="center" gap="md">
        <div style={{ opacity: 0.3 }}>
          {icon}
        </div>
        {title && (
          <Text fw={500} size="sm">
            {title}
          </Text>
        )}
        <Text size="sm" c="dimmed" ta="center" maw={300}>
          {description}
        </Text>
        {action}
      </Stack>
    </GlassCard>
  );
}
