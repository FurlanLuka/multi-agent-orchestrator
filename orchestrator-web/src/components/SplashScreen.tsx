import {
  Box,
  Stack,
  Text,
  Loader,
  Button,
  Code,
  ThemeIcon,
  Group,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTerminal2, IconPlugConnectedX } from '@tabler/icons-react';
import type { DependencyCheckResult } from '@orchy/types';
import { GlassCard, pageBg } from '../theme';

interface SplashScreenProps {
  checking: boolean;
  dependencyCheck: DependencyCheckResult | null;
  backendError?: string | null;
  onRetry: () => void;
}

export function SplashScreen({ checking, dependencyCheck, backendError, onRetry }: SplashScreenProps) {
  // Backend error state (port unavailable, etc.)
  if (backendError) {
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
                <IconPlugConnectedX size={28} />
              </ThemeIcon>
              <Text size="xl" fw={700}>
                Backend Unavailable
              </Text>
            </Group>

            <Text c="dimmed">
              The orchestrator backend could not start. This usually happens when another instance is already running.
            </Text>

            <GlassCard p="md">
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Error Details:
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap' }}>
                  {backendError}
                </Code>
              </Stack>
            </GlassCard>

            <GlassCard p="md">
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Try the following:
                </Text>
                <Text size="sm" c="dimmed">
                  1. Close other Orchy instances
                </Text>
                <Text size="sm" c="dimmed">
                  2. Check if port 3456 is in use by another application
                </Text>
                <Text size="sm" c="dimmed">
                  3. Restart the application
                </Text>
              </Stack>
            </GlassCard>

            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => window.location.reload()}
              variant="light"
              color="honey"
            >
              Restart Application
            </Button>
          </Stack>
        </GlassCard>
      </Box>
    );
  }

  // Loading state
  if (checking || !dependencyCheck) {
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
        <Stack align="center" gap="md">
          <Loader size="lg" color="peach" />
          <Text size="lg" fw={500} c="dimmed">
            Checking dependencies...
          </Text>
        </Stack>
      </Box>
    );
  }

  // Claude not available - error state
  if (!dependencyCheck.claude.available) {
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
              <ThemeIcon size="xl" radius="md" color="rose" variant="light">
                <IconAlertCircle size={28} />
              </ThemeIcon>
              <Text size="xl" fw={700}>
                Claude CLI Required
              </Text>
            </Group>

            <Text c="dimmed">
              The Multi-Agent Orchestrator requires Claude CLI to be installed and available in your PATH.
            </Text>

            <GlassCard p="md">
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Install Claude CLI:
                </Text>
                <Group gap="xs">
                  <ThemeIcon size="sm" radius="sm" color="gray" variant="light">
                    <IconTerminal2 size={14} />
                  </ThemeIcon>
                  <Code>npm install -g @anthropic-ai/claude-code</Code>
                </Group>
                <Text size="xs" c="dimmed" mt="xs">
                  After installation, make sure to authenticate with <Code>claude auth login</Code>
                </Text>
              </Stack>
            </GlassCard>

            {dependencyCheck.claude.error && (
              <Text size="sm" c="rose">
                Error: {dependencyCheck.claude.error}
              </Text>
            )}

            {(dependencyCheck.claude as any).debug && (
              <GlassCard p="sm">
                <Text size="xs" fw={500} mb="xs">Debug Info:</Text>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                  {(dependencyCheck.claude as any).debug}
                </Code>
              </GlassCard>
            )}

            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={onRetry}
              variant="light"
              color="peach"
            >
              Retry
            </Button>
          </Stack>
        </GlassCard>
      </Box>
    );
  }

  // This shouldn't happen, but handle it gracefully
  return null;
}
