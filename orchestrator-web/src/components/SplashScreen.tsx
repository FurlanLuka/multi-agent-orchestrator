import {
  Box,
  Stack,
  Text,
  Loader,
  Button,
  Code,
  Paper,
  ThemeIcon,
  Group,
} from '@mantine/core';
import { IconAlertCircle, IconRefresh, IconTerminal2, IconPlugConnectedX } from '@tabler/icons-react';
import type { DependencyCheckResult } from '@aio/types';

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
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        <Paper
          shadow="md"
          p="xl"
          radius="lg"
          style={{
            maxWidth: 500,
            border: '1px solid var(--mantine-color-orange-3)',
          }}
        >
          <Stack gap="lg">
            <Group>
              <ThemeIcon size="xl" radius="md" color="orange" variant="light">
                <IconPlugConnectedX size={28} />
              </ThemeIcon>
              <Text size="xl" fw={700}>
                Backend Unavailable
              </Text>
            </Group>

            <Text c="dimmed">
              The orchestrator backend could not start. This usually happens when another instance is already running.
            </Text>

            <Paper p="md" radius="md" bg="orange.0">
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Error Details:
                </Text>
                <Code block style={{ whiteSpace: 'pre-wrap' }}>
                  {backendError}
                </Code>
              </Stack>
            </Paper>

            <Paper p="md" radius="md" bg="gray.1">
              <Stack gap="xs">
                <Text size="sm" fw={500}>
                  Try the following:
                </Text>
                <Text size="sm" c="dimmed">
                  1. Close other AIO Orchestrator instances
                </Text>
                <Text size="sm" c="dimmed">
                  2. Check if port 3456 is in use by another application
                </Text>
                <Text size="sm" c="dimmed">
                  3. Restart the application
                </Text>
              </Stack>
            </Paper>

            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={() => window.location.reload()}
              variant="light"
              color="orange"
            >
              Restart Application
            </Button>
          </Stack>
        </Paper>
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
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        <Stack align="center" gap="md">
          <Loader size="lg" color="blue" />
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
          backgroundColor: 'var(--mantine-color-gray-0)',
        }}
      >
        <Paper
          shadow="md"
          p="xl"
          radius="lg"
          style={{
            maxWidth: 500,
            border: '1px solid var(--mantine-color-red-3)',
          }}
        >
          <Stack gap="lg">
            <Group>
              <ThemeIcon size="xl" radius="md" color="red" variant="light">
                <IconAlertCircle size={28} />
              </ThemeIcon>
              <Text size="xl" fw={700}>
                Claude CLI Required
              </Text>
            </Group>

            <Text c="dimmed">
              The Multi-Agent Orchestrator requires Claude CLI to be installed and available in your PATH.
            </Text>

            <Paper p="md" radius="md" bg="gray.1">
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
            </Paper>

            {dependencyCheck.claude.error && (
              <Text size="sm" c="red">
                Error: {dependencyCheck.claude.error}
              </Text>
            )}

            {(dependencyCheck.claude as any).debug && (
              <Paper p="sm" radius="md" bg="gray.2" style={{ fontFamily: 'monospace' }}>
                <Text size="xs" fw={500} mb="xs">Debug Info:</Text>
                <Code block style={{ whiteSpace: 'pre-wrap', fontSize: '11px' }}>
                  {(dependencyCheck.claude as any).debug}
                </Code>
              </Paper>
            )}

            <Button
              leftSection={<IconRefresh size={16} />}
              onClick={onRetry}
              variant="light"
              color="blue"
            >
              Retry
            </Button>
          </Stack>
        </Paper>
      </Box>
    );
  }

  // This shouldn't happen, but handle it gracefully
  return null;
}
