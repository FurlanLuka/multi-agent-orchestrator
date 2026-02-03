import { useState, useEffect } from 'react';
import {
  Modal,
  Stack,
  Text,
  Group,
  Button,
  ThemeIcon,
  Loader,
  Badge,
  Alert,
  Anchor,
} from '@mantine/core';
import {
  IconBrandGithub,
  IconCloudUpload,
  IconShield,
  IconRocket,
  IconX,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';
import type { GitHubGlobalSettings } from '@orchy/types';

interface GitHubSetupModalProps {
  opened: boolean;
  onClose: () => void;
  onEnable: (settings: Partial<GitHubGlobalSettings>) => void;
  onDismiss: () => void;  // "Don't ask again"
}

export function GitHubSetupModal({
  opened,
  onClose,
  onEnable,
  onDismiss,
}: GitHubSetupModalProps) {
  const [checking, setChecking] = useState(false);
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [defaultVisibility, setDefaultVisibility] = useState<'private' | 'public'>('private');

  // Check auth status when modal opens
  useEffect(() => {
    if (opened) {
      checkAuthStatus();
    }
  }, [opened]);

  const checkAuthStatus = async () => {
    setChecking(true);
    try {
      const effectivePort = (window as unknown as { __ORCHESTRATOR_PORT__?: number }).__ORCHESTRATOR_PORT__ ?? 3456;
      const response = await fetch(`http://localhost:${effectivePort}/api/github/auth`);
      const data = await response.json();
      setAuthenticated(data.authenticated);
      setUsername(data.username || null);
    } catch (err) {
      console.error('Failed to check GitHub auth:', err);
      setAuthenticated(false);
    } finally {
      setChecking(false);
    }
  };

  const handleEnable = () => {
    onEnable({
      enabled: true,
      promptedOnFirstLoad: true,
      defaultVisibility,
    });
  };

  const handleDismiss = () => {
    onDismiss();
  };

  const handleSkip = () => {
    onClose();
  };

  const benefits = [
    {
      icon: <IconCloudUpload size={16} />,
      title: 'Auto-push to Remote',
      description: 'Changes are automatically pushed to GitHub after sessions complete',
    },
    {
      icon: <IconRocket size={16} />,
      title: 'Quick Repo Setup',
      description: 'Create GitHub repos directly when creating new workspaces',
    },
    {
      icon: <IconShield size={16} />,
      title: 'Secure Secrets',
      description: 'Set GitHub Actions secrets with explicit command disclosure',
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <ThemeIcon color="dark" variant="light" size="sm">
            <IconBrandGithub size={16} />
          </ThemeIcon>
          <Text fw={600}>GitHub Integration</Text>
        </Group>
      }
      centered
      size="md"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          Orchy can integrate with GitHub to streamline your workflow. Enable this feature
          to get automatic repository creation and push capabilities.
        </Text>

        {/* Auth Status */}
        {checking ? (
          <Group gap="xs">
            <Loader size={16} />
            <Text size="sm" c="dimmed">Checking authentication...</Text>
          </Group>
        ) : authenticated ? (
          <Alert color="green" variant="light" icon={<IconCheck size={16} />}>
            <Group justify="space-between" wrap="nowrap">
              <Text size="sm">
                Authenticated as <Text span fw={500}>{username}</Text>
              </Text>
              <Badge size="sm" color="green" variant="light">Connected</Badge>
            </Group>
          </Alert>
        ) : (
          <Alert color="orange" variant="light" icon={<IconAlertCircle size={16} />}>
            <Stack gap="xs">
              <Text size="sm">
                GitHub CLI is not authenticated. Run this command in your terminal:
              </Text>
              <Text size="sm" ff="monospace" c="dimmed">
                gh auth login
              </Text>
              <Button size="xs" variant="subtle" onClick={checkAuthStatus}>
                Check Again
              </Button>
            </Stack>
          </Alert>
        )}

        {/* Benefits */}
        <Stack gap="xs">
          <Text size="sm" fw={500}>Benefits:</Text>
          {benefits.map((benefit, index) => (
            <Group key={index} gap="sm" wrap="nowrap" align="flex-start">
              <ThemeIcon color="peach" variant="light" size="sm" mt={2}>
                {benefit.icon}
              </ThemeIcon>
              <div>
                <Text size="sm" fw={500}>{benefit.title}</Text>
                <Text size="xs" c="dimmed">{benefit.description}</Text>
              </div>
            </Group>
          ))}
        </Stack>

        {/* Default Visibility */}
        <Group justify="space-between" align="center">
          <div>
            <Text size="sm" fw={500}>Default Repository Visibility</Text>
            <Text size="xs" c="dimmed">New repositories will be created as</Text>
          </div>
          <Group gap="xs">
            <Button
              size="xs"
              variant={defaultVisibility === 'private' ? 'filled' : 'light'}
              color={defaultVisibility === 'private' ? 'peach' : 'gray'}
              onClick={() => setDefaultVisibility('private')}
            >
              Private
            </Button>
            <Button
              size="xs"
              variant={defaultVisibility === 'public' ? 'filled' : 'light'}
              color={defaultVisibility === 'public' ? 'peach' : 'gray'}
              onClick={() => setDefaultVisibility('public')}
            >
              Public
            </Button>
          </Group>
        </Group>

        {/* Actions */}
        <Stack gap="xs" mt="xs">
          <Button
            fullWidth
            color="peach"
            leftSection={<IconBrandGithub size={18} />}
            onClick={handleEnable}
            disabled={!authenticated}
          >
            Enable GitHub Integration
          </Button>
          <Group grow>
            <Button
              variant="subtle"
              color="gray"
              onClick={handleSkip}
            >
              Maybe Later
            </Button>
            <Button
              variant="subtle"
              color="gray"
              onClick={handleDismiss}
              leftSection={<IconX size={14} />}
            >
              Don't Ask Again
            </Button>
          </Group>
        </Stack>

        <Text size="xs" c="dimmed" ta="center">
          You can always enable or configure this later in settings.{' '}
          <Anchor href="https://cli.github.com" target="_blank" size="xs">
            Learn more about gh CLI
          </Anchor>
        </Text>
      </Stack>
    </Modal>
  );
}
