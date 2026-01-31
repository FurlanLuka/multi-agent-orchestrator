import {
  Box,
  Stack,
  Text,
  ThemeIcon,
  Group,
} from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { GlassCard, pageBg } from '../theme';

interface SecondaryTabScreenProps {
  message: string;
}

export function SecondaryTabScreen({ message }: SecondaryTabScreenProps) {
  return (
    <Box
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: pageBg.gradient,
      }}
    >
      <GlassCard p="xl" style={{ maxWidth: 500 }}>
        <Stack gap="lg">
          <Group>
            <ThemeIcon size="xl" radius="md" color="honey" variant="light">
              <IconAlertTriangle size={28} />
            </ThemeIcon>
            <Text size="xl" fw={700}>
              Another Tab is Active
            </Text>
          </Group>

          <Text c="dimmed">
            {message}
          </Text>

          <GlassCard p="md">
            <Stack gap="xs">
              <Text size="sm" fw={500}>
                What to do:
              </Text>
              <Text size="sm" c="dimmed">
                Close this tab and continue using the other one.
              </Text>
            </Stack>
          </GlassCard>

          <Text size="xs" c="dimmed" ta="center">
            Only one UI tab can be active at a time to prevent conflicts.
          </Text>
        </Stack>
      </GlassCard>
    </Box>
  );
}
