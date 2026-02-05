import { useState, useEffect } from 'react';
import {
  Stack,
  Text,
  Button,
  Group,
  Badge,
  Loader,
  UnstyledButton,
  Box,
} from '@mantine/core';
import { IconRocket, IconServer, IconCheck } from '@tabler/icons-react';
import type { WorkspaceConfig, DeploymentState } from '@orchy/types';
import { FormCard, GlassTextarea } from '../../theme';

interface ProviderListItem {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface DeploymentTabProps {
  workspace: WorkspaceConfig;
  port: number;
  startingSession: boolean;
  onStartDeployment: (provider: string, description: string, workspaceId: string) => void;
}

export function DeploymentTab({
  workspace,
  port,
  startingSession,
  onStartDeployment,
}: DeploymentTabProps) {
  const [providers, setProviders] = useState<ProviderListItem[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [description, setDescription] = useState('');

  const existingDeployment: DeploymentState | undefined = workspace.deployment;
  const hasExistingDeployment = !!existingDeployment;

  // Fetch providers
  useEffect(() => {
    fetch(`http://localhost:${port}/api/deployment/providers`)
      .then(res => res.json())
      .then((data: ProviderListItem[]) => {
        setProviders(data);
        if (data.length === 1) {
          setSelectedProvider(data[0].id);
        }
      })
      .catch(err => {
        console.error('Failed to fetch deployment providers:', err);
      })
      .finally(() => setLoadingProviders(false));
  }, [port]);

  const handleStart = () => {
    if (!selectedProvider) return;
    onStartDeployment(selectedProvider, description, workspace.id);
  };

  if (loadingProviders) {
    return (
      <Stack align="center" py="xl">
        <Loader size="sm" />
        <Text size="sm" c="dimmed">Loading providers...</Text>
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      {/* Existing deployment info */}
      {hasExistingDeployment && existingDeployment && (
        <FormCard showHeader>
          <Stack gap="sm">
            <Group justify="space-between" align="center">
              <Text fw={600} size="sm">Current Deployment</Text>
              <Badge color="green" variant="light" size="sm" leftSection={<IconCheck size={10} />}>
                Active
              </Badge>
            </Group>
            <Stack gap={4}>
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>Server:</Text>
                <Text size="xs" ff="monospace">{existingDeployment.serverName}</Text>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>IP:</Text>
                <Text size="xs" ff="monospace">{existingDeployment.serverIp}</Text>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>Instance:</Text>
                <Text size="xs" ff="monospace">{existingDeployment.instanceType}</Text>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>Location:</Text>
                <Text size="xs" ff="monospace">{existingDeployment.location}</Text>
              </Group>
              <Group gap="xs">
                <Text size="xs" c="dimmed" w={100}>Provider:</Text>
                <Text size="xs" ff="monospace">{existingDeployment.provider}</Text>
              </Group>
            </Stack>
          </Stack>
        </FormCard>
      )}

      {/* Provider selection */}
      <Stack gap="xs">
        <Text fw={600} size="sm">Select Provider</Text>
        <Group gap="sm">
          {providers.map(provider => (
            <UnstyledButton
              key={provider.id}
              onClick={() => setSelectedProvider(provider.id)}
              style={{
                padding: '12px 16px',
                borderRadius: 10,
                border: `1.5px solid ${selectedProvider === provider.id
                  ? 'var(--mantine-color-lavender-5)'
                  : 'rgba(160, 130, 110, 0.12)'}`,
                background: selectedProvider === provider.id
                  ? 'rgba(139, 127, 219, 0.06)'
                  : 'rgba(250, 247, 245, 0.6)',
                cursor: 'pointer',
                transition: 'all 150ms ease',
                flex: 1,
                minWidth: 140,
              }}
            >
              <Stack gap={4}>
                <Group gap="xs" align="center">
                  <IconServer size={16} style={{
                    color: selectedProvider === provider.id
                      ? 'var(--mantine-color-lavender-5)'
                      : 'var(--mantine-color-gray-5)'
                  }} />
                  <Text fw={600} size="sm">{provider.name}</Text>
                </Group>
                <Text size="xs" c="dimmed">{provider.description}</Text>
              </Stack>
            </UnstyledButton>
          ))}
        </Group>
      </Stack>

      {/* Description input */}
      {selectedProvider && (
        <Box>
          <GlassTextarea
            label="Deployment Description"
            placeholder={hasExistingDeployment
              ? 'Upgrade server, add DNS, configure firewall...'
              : 'Deploy to Hetzner with Docker, set up CI/CD...'
            }
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            minRows={3}
            maxRows={6}
            autosize
          />
        </Box>
      )}

      {/* Start button */}
      {selectedProvider && (
        <Group justify="flex-end">
          <Button
            leftSection={startingSession ? <Loader size={18} /> : <IconRocket size={18} />}
            onClick={handleStart}
            disabled={!description.trim() || startingSession}
            loading={startingSession}
          >
            {hasExistingDeployment ? 'Start Modification' : 'Start Deployment Planning'}
          </Button>
        </Group>
      )}
    </Stack>
  );
}
